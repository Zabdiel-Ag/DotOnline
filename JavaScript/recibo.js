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
   QR inside ticket (global QRCode from qrcode.min.js)
========================= */
async function renderQrToCanvas(canvas, text){
    if (!canvas) throw new Error("No existe el canvas #rmQR");

  const ctx2d = canvas.getContext("2d");
  ctx2d?.clearRect(0, 0, canvas.width, canvas.height);

  await QRCode.toCanvas(canvas, text, {
    margin: 1,
    width: 170,
    errorCorrectionLevel: "M",
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
          <div class="n">${name}</div>
          <div class="s">${qty} x ${unit}</div>
        </div>
        <div class="item-total">${total}</div>
      `;
      wrap.appendChild(row);
    }
  }

  $("rxThanks").textContent = `Gracias por tu compra 💙 — ${bizName}`;

  //  QR con el link "share" (abre el recibo)
  const c = $("rxQRCanvas");
  return renderQrToCanvas(c, shareUrl);
}

/* =========================
   PDF 80mm (thermal ticket)
========================= */
async function downloadTicketPdf(){
  const area = document.getElementById("pdfArea");
  if (!area) throw new Error("No existe #pdfArea");

  // Render DOM -> canvas
  const canvas = await html2canvas(area, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");

  // Ticket width: 80mm
  // 1mm ≈ 2.8346 pt
  const MM_TO_PT = 2.834645669;
  const pageWmm = 80;
  const pageWpt = pageWmm * MM_TO_PT;

  // Altura dinámica basada en la imagen
  const imgWpt = pageWpt;
  const imgHpt = (canvas.height * imgWpt) / canvas.width;

  const { jsPDF } = window.jspdf;

  // Creamos pdf con tamaño personalizado: [ancho, alto] en puntos
  // Si es muy alto, hacemos multipágina a 80mm
  const pageHpt = 420 * MM_TO_PT; // ~420mm por página (suficiente), o usamos multipage
  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: [pageWpt, Math.min(imgHpt, pageHpt)],
  });

  if (imgHpt <= pageHpt) {
    pdf.addImage(imgData, "PNG", 0, 0, imgWpt, imgHpt);
  } else {
    // multipágina: cortamos por “ventanas” verticales
    // Usamos el truco de dibujar la misma imagen con y negativo
    let remaining = imgHpt;
    let y = 0;

    // primera página ya creada
    pdf.addImage(imgData, "PNG", 0, y, imgWpt, imgHpt);
    remaining -= pageHpt;

    while (remaining > 0) {
      pdf.addPage([pageWpt, Math.min(pageHpt, remaining)]);
      y -= pageHpt;
      pdf.addImage(imgData, "PNG", 0, y, imgWpt, imgHpt);
      remaining -= pageHpt;
    }
  }

  const folio = (document.getElementById("rxFolio")?.textContent || "RECIBO").trim();
  const fileName = `Ticket_${folio}.pdf`.replace(/\s+/g, "_");
  pdf.save(fileName);
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
}

/* =========================
   Init
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  wireButtons();

  const token = getTokenFromUrl();
  if (!token) return showErr("Falta el token (?t=...)");

  //  Este es el link “share” que el QR debe contener (sin obligar pdf)
  const shareUrl = `${location.origin}/recibo.html?t=${encodeURIComponent(token)}`;

  try{
    const { biz, sale } = await fetchReceiptByToken(token);

    // Render ticket + QR
    await renderReceipt({ biz, sale, shareUrl });

    // Si viene pdf=1 -> auto descarga el PDF ticket
    if (String(getParam("pdf") || "") === "1") {
      setTimeout(() => downloadTicketPdf().catch(console.error), 450);
    }
  }catch(e){
    console.error("recibo error:", e);
    showErr(e?.message || String(e));
  }
});
