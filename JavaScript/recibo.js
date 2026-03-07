import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";
import { supabase } from "./supabaseClient.js";

/* =========================
   Helpers
========================= */
function $(id){ return document.getElementById(id); }

function money(n){
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function showErr(msg){
  const el = $("rxErr");
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}

function shortId(uuid){
  try { return String(uuid).split("-")[0].toUpperCase(); }
  catch { return String(uuid || ""); }
}

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function getTokenFromUrl(){
  return getParam("t") || "";
}

function pmLabel(pm){
  const v = String(pm || "").toLowerCase();
  if (v === "cash") return "Efectivo";
  if (v === "card") return "Tarjeta";
  if (v === "transfer") return "Transferencia";
  if (v === "mixed") return "Mixto";
  return pm || "—";
}

function extractRefFromNote(note){
  const s = String(note || "").trim();
  if (!s) return "";
  const m = s.match(/ref\s*:\s*(.+)$/i);
  return m ? String(m[1]).trim() : "";
}

function safeText(v, fallback="—"){
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

/* =========================
   Supabase fetch
========================= */
async function fetchReceiptByToken(token){
  const { data: link, error: linkErr } = await supabase
    .from("receipt_links")
    .select("token, sale_id, business_id, created_at")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) throw linkErr;
  if (!link) throw new Error("Token no válido o expirado.");

  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id, name, handle, category, currency, timezone, logo_url")
    .eq("id", link.business_id)
    .maybeSingle();

  if (bizErr) console.warn("biz fetch warning:", bizErr);

  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .select(`
      id,
      business_id,
      created_at,
      status,
      payment_method,
      subtotal,
      discount,
      tax,
      total,
      note,
      sale_items (
        id,
        product_id,
        name,
        qty,
        unit_price,
        line_total
      )
    `)
    .eq("id", link.sale_id)
    .eq("business_id", link.business_id)
    .maybeSingle();

  if (saleErr) throw saleErr;
  if (!sale) throw new Error("Venta no encontrada.");

  return { link, biz, sale };
}

/* =========================
   QR inside ticket
========================= */
async function renderQrToCanvas(canvas, text){
  if (!canvas) throw new Error("No existe el canvas #rxQRCanvas");

  const ctx2d = canvas.getContext("2d");
  ctx2d?.clearRect(0, 0, canvas.width, canvas.height);

  await QRCode.toCanvas(canvas, text, {
    margin: 1,
    width: 180,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF"
    }
  });
}

/* =========================
   Render ticket
========================= */
function renderReceipt({ biz, sale, shareUrl }){
  const bizName = biz?.name || "Mi POS";
  $("rxBizName").textContent = bizName;

  const meta = [
    biz?.category ? biz.category : null,
    biz?.handle ? `@${biz.handle}` : null,
  ].filter(Boolean).join(" • ");
  $("rxBizMeta").textContent = meta || "—";

  const logoEl = $("rxLogo");
  const logoUrl = biz?.logo_url || "";
  if (logoEl) {
    if (logoUrl) {
      logoEl.src = logoUrl;
      logoEl.style.display = "block";
    } else {
      logoEl.style.display = "none";
    }
  }

  $("rxDate").textContent = new Date(sale.created_at).toLocaleString("es-MX");
  $("rxFolio").textContent = shortId(sale.id);

  $("rxPayMethod").textContent = pmLabel(sale.payment_method);
  $("rxPayRef").textContent = extractRefFromNote(sale.note) || "—";
  $("rxNote").textContent = sale.note ? String(sale.note) : "—";

  $("rxSubtotal").textContent = money(sale.subtotal);
  $("rxDiscount").textContent = money(sale.discount);
  $("rxTax").textContent = money(sale.tax);
  $("rxTotal").textContent = money(sale.total);

  const items = sale.sale_items || [];
  $("rxItemsCount").textContent = `${items.length}`;

  const wrap = $("rxItems");
  wrap.innerHTML = "";

  if (!items.length){
    wrap.innerHTML = `<div class="t-muted t-small">Sin items.</div>`;
  } else {
    for (const it of items){
      const name = safeText(it.name);
      const qty = Number(it.qty || 0);
      const unit = money(it.unit_price);
      const total = money(it.line_total);

      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item-name">
          <div class="n fw-bold">${name}</div>
          <div class="s">${qty} x ${unit}</div>
        </div>
        <div class="item-total fw-bold">${total}</div>
      `;
      wrap.appendChild(row);
    }
  }

  $("rxThanks").textContent = `Gracias por tu compra 💙 — ${bizName}`;

  const c = $("rxQRCanvas");
  return renderQrToCanvas(c, shareUrl);
}

/* =========================
   PDF 80x297mm
========================= */
async function downloadTicketPdf(){
  const area = document.getElementById("pdfArea");
  if (!area) throw new Error("No existe #pdfArea");

  // Fuerza estilo para exportación nítida
  area.classList.add("pdf-render-mode");

  const canvas = await html2canvas(area, {
    scale: 4,                 // antes 2, ahora más nítido
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    letterRendering: true,
    imageTimeout: 0
  });

  area.classList.remove("pdf-render-mode");

  const imgData = canvas.toDataURL("image/png", 1.0);

  const MM_TO_PT = 2.834645669;
  const pageWmm = 80;
  const pageHmm = 297;
  const pageWpt = pageWmm * MM_TO_PT;
  const pageHpt = pageHmm * MM_TO_PT;

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: [pageWpt, pageHpt],
    compress: false
  });

  // margen pequeño para centrar visualmente
  const marginPt = 8;
  const usableW = pageWpt - (marginPt * 2);

  const imgWpt = usableW;
  const imgHpt = (canvas.height * imgWpt) / canvas.width;

  let y = 10; // pequeño respiro arriba

  if (imgHpt <= pageHpt - 20) {
    // Centrado vertical
    y = (pageHpt - imgHpt) / 2;
    pdf.addImage(imgData, "PNG", marginPt, y, imgWpt, imgHpt, undefined, "FAST");
  } else {
    // Si llega a exceder, se pega arriba pero manteniendo ancho de 80mm
    pdf.addImage(imgData, "PNG", marginPt, 10, imgWpt, imgHpt, undefined, "FAST");
  }

  const folio = (document.getElementById("rxFolio")?.textContent || "RECIBO").trim();
  const fileName = `Ticket_${folio}.pdf`.replace(/\s+/g, "_");
  pdf.save(fileName);
}

/* =========================
   Print directly
========================= */
function printTicket(){
  window.print();
}

/* =========================
   Buttons
========================= */
function wireButtons(){
  $("btnCopy")?.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(location.href);
      $("btnCopy").innerHTML = `<i class="bi bi-check2 me-1"></i> Copiado`;
      setTimeout(() => {
        $("btnCopy").innerHTML = `<i class="bi bi-clipboard me-1"></i> Copiar link`;
      }, 1200);
    }catch{
      showErr("No pude copiar el link 😅");
    }
  });

  $("btnPdf")?.addEventListener("click", async () => {
    try { await downloadTicketPdf(); }
    catch(e){ console.error(e); showErr(e?.message || String(e)); }
  });

  $("btnPrint")?.addEventListener("click", () => {
    try { printTicket(); }
    catch(e){ console.error(e); showErr(e?.message || String(e)); }
  });
}

/* =========================
   Init
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  wireButtons();

  const token = getTokenFromUrl();
  if (!token) return showErr("Falta el token (?t=...)");

  const shareUrl = `${location.origin}/recibo.html?t=${encodeURIComponent(token)}`;

  try{
    const { biz, sale } = await fetchReceiptByToken(token);

    await renderReceipt({ biz, sale, shareUrl });

    if (String(getParam("pdf") || "") === "1") {
      setTimeout(() => downloadTicketPdf().catch(console.error), 450);
    }

    if (String(getParam("print") || "") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }catch(e){
    console.error("recibo error:", e);
    showErr(e?.message || String(e));
  }
});