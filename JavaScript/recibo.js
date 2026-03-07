import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";
import { supabase } from "./supabaseClient.js";

/* =========================
   Helpers
========================= */
function $(id) {
  return document.getElementById(id);
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}

function showErr(msg) {
  const el = $("rxErr");
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}

function shortId(uuid) {
  try {
    return String(uuid).split("-")[0].toUpperCase();
  } catch {
    return String(uuid || "");
  }
}

function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function getTokenFromUrl() {
  return getParam("t") || "";
}

function pmLabel(pm) {
  const v = String(pm || "").toLowerCase();
  if (v === "cash") return "Efectivo";
  if (v === "card") return "Tarjeta";
  if (v === "transfer") return "Transferencia";
  if (v === "mixed") return "Mixto";
  return pm || "—";
}

function extractRefFromNote(note) {
  const s = String(note || "").trim();
  if (!s) return "";
  const m = s.match(/ref\s*:\s*(.+)$/i);
  return m ? String(m[1]).trim() : "";
}

function safeText(v, fallback = "—") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

/* =========================
   Supabase fetch
========================= */
async function fetchReceiptByToken(token) {
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

  if (bizErr) {
    console.warn("biz fetch warning:", bizErr);
  }

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
   QR del ticket
========================= */
async function renderQrToCanvas(canvas, text) {
  if (!canvas) throw new Error("No existe el canvas #rxQRCanvas");

  const ctx2d = canvas.getContext("2d");
  if (ctx2d) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }

  await QRCode.toCanvas(canvas, text, {
    margin: 1,
    width: 190,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF"
    }
  });
}

/* =========================
   Fuerza estilo negro + bold
========================= */
function forceReceiptBlackStyle() {
  const area = $("pdfArea");
  if (!area) return;

  area.style.background = "#ffffff";
  area.style.color = "#000000";
  area.style.fontWeight = "700";
  area.style.width = "80mm";
  area.style.minHeight = "297mm";
  area.style.margin = "0 auto";

  const all = area.querySelectorAll("*");
  all.forEach((el) => {
    el.style.color = "#000000";
    el.style.opacity = "1";
    el.style.textShadow = "none";
    el.style.filter = "none";
    el.style.fontWeight = "700";
  });

  const strongs = area.querySelectorAll(
    "#rxBizName, #rxBizMeta, #rxDate, #rxFolio, #rxPayMethod, #rxPayRef, #rxNote, #rxSubtotal, #rxDiscount, #rxTax, #rxTotal, #rxThanks, #rxItemsCount, .item, .item-name, .item-name .n, .item-name .s, .item-total, .title, .section-title, strong, b, h1, h2, h3, h4, h5, h6"
  );

  strongs.forEach((el) => {
    el.style.color = "#000000";
    el.style.fontWeight = "800";
  });

  const lines = area.querySelectorAll("hr, .divider");
  lines.forEach((el) => {
    el.style.border = "0";
    el.style.borderTop = "1px solid #000000";
    el.style.opacity = "1";
  });

  const logoEl = $("rxLogo");
  if (logoEl && logoEl.src) {
    logoEl.style.display = "block";
    logoEl.style.margin = "0 auto 8px auto";
  }

  const qr = $("rxQRCanvas");
  if (qr) {
    qr.style.display = "block";
    qr.style.margin = "12px auto 0 auto";
    qr.style.background = "#ffffff";
  }
}

/* =========================
   Render ticket
========================= */
function renderReceipt({ biz, sale, shareUrl }) {
  const bizName = biz?.name || "Mi POS";

  if ($("rxBizName")) $("rxBizName").textContent = bizName;

  const meta = [
    biz?.category ? biz.category : null,
    biz?.handle ? `@${biz.handle}` : null
  ].filter(Boolean).join(" • ");

  if ($("rxBizMeta")) $("rxBizMeta").textContent = meta || "—";

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

  if ($("rxDate")) {
    $("rxDate").textContent = new Date(sale.created_at).toLocaleString("es-MX");
  }

  if ($("rxFolio")) {
    $("rxFolio").textContent = shortId(sale.id);
  }

  if ($("rxPayMethod")) {
    $("rxPayMethod").textContent = pmLabel(sale.payment_method);
  }

  if ($("rxPayRef")) {
    $("rxPayRef").textContent = extractRefFromNote(sale.note) || "—";
  }

  if ($("rxNote")) {
    $("rxNote").textContent = sale.note ? String(sale.note) : "—";
  }

  if ($("rxSubtotal")) $("rxSubtotal").textContent = money(sale.subtotal);
  if ($("rxDiscount")) $("rxDiscount").textContent = money(sale.discount);
  if ($("rxTax")) $("rxTax").textContent = money(sale.tax);
  if ($("rxTotal")) $("rxTotal").textContent = money(sale.total);

  const items = sale.sale_items || [];
  if ($("rxItemsCount")) $("rxItemsCount").textContent = `${items.length}`;

  const wrap = $("rxItems");
  if (wrap) {
    wrap.innerHTML = "";

    if (!items.length) {
      wrap.innerHTML = `<div class="t-muted t-small" style="color:#000;font-weight:700;">Sin items.</div>`;
    } else {
      for (const it of items) {
        const name = safeText(it.name);
        const qty = Number(it.qty || 0);
        const unit = money(it.unit_price);
        const total = money(it.line_total);

        const row = document.createElement("div");
        row.className = "item";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "flex-start";
        row.style.gap = "8px";
        row.style.padding = "6px 0";
        row.style.borderBottom = "1px solid #000";

        row.innerHTML = `
          <div class="item-name" style="flex:1; color:#000; font-weight:700;">
            <div class="n" style="color:#000; font-weight:800;">${name}</div>
            <div class="s" style="color:#000; font-weight:700;">${qty} x ${unit}</div>
          </div>
          <div class="item-total" style="color:#000; font-weight:800; white-space:nowrap;">${total}</div>
        `;

        wrap.appendChild(row);
      }
    }
  }

  if ($("rxThanks")) {
    $("rxThanks").textContent = `Gracias por tu compra 💙 — ${bizName}`;
  }

  forceReceiptBlackStyle();

  const c = $("rxQRCanvas");
  return renderQrToCanvas(c, shareUrl);
}

/* =========================
   PDF 80x297mm
========================= */
async function downloadTicketPdf() {
  const area = $("pdfArea");
  if (!area) throw new Error("No existe #pdfArea");

  forceReceiptBlackStyle();
  area.classList.add("pdf-render-mode");

  const canvas = await html2canvas(area, {
    scale: 4,
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

  const marginPt = 8;
  const usableW = pageWpt - (marginPt * 2);
  const imgWpt = usableW;
  const imgHpt = (canvas.height * imgWpt) / canvas.width;

  let y = 10;

  if (imgHpt <= pageHpt - 20) {
    y = (pageHpt - imgHpt) / 2;
    pdf.addImage(imgData, "PNG", marginPt, y, imgWpt, imgHpt, undefined, "FAST");
  } else {
    pdf.addImage(imgData, "PNG", marginPt, 10, imgWpt, imgHpt, undefined, "FAST");
  }

  const folio = (document.getElementById("rxFolio")?.textContent || "RECIBO").trim();
  const fileName = `Ticket_${folio}.pdf`.replace(/\s+/g, "_");
  pdf.save(fileName);
}

/* =========================
   Imprimir directo
========================= */
function printTicket() {
  forceReceiptBlackStyle();
  window.print();
}

/* =========================
   Buttons
========================= */
function wireButtons() {
  $("btnCopy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("btnCopy").innerHTML = `<i class="bi bi-check2 me-1"></i> Copiado`;

      setTimeout(() => {
        $("btnCopy").innerHTML = `<i class="bi bi-clipboard me-1"></i> Copiar link`;
      }, 1200);
    } catch {
      showErr("No pude copiar el link 😅");
    }
  });

  $("btnPdf")?.addEventListener("click", async () => {
    try {
      await downloadTicketPdf();
    } catch (e) {
      console.error(e);
      showErr(e?.message || String(e));
    }
  });

  $("btnPrint")?.addEventListener("click", () => {
    try {
      printTicket();
    } catch (e) {
      console.error(e);
      showErr(e?.message || String(e));
    }
  });
}

/* =========================
   Init
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  wireButtons();

  const token = getTokenFromUrl();
  if (!token) {
    showErr("Falta el token (?t=...)");
    return;
  }

  const shareUrl = `${location.origin}/recibo.html?t=${encodeURIComponent(token)}`;

  try {
    const { biz, sale } = await fetchReceiptByToken(token);

    await renderReceipt({ biz, sale, shareUrl });
    forceReceiptBlackStyle();

    if (String(getParam("pdf") || "") === "1") {
      setTimeout(() => {
        downloadTicketPdf().catch(console.error);
      }, 450);
    }

    if (String(getParam("print") || "") === "1") {
      setTimeout(() => {
        forceReceiptBlackStyle();
        window.print();
      }, 500);
    }
  } catch (e) {
    console.error("recibo error:", e);
    showErr(e?.message || String(e));
  }
});