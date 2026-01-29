import { supabase } from "./supabaseClient.js";

const USERS_KEY = "pos_users";
const SESSION_KEY = "pos_session";
const BUSINESSES_KEY = "pos_businesses";
const PRODUCTS_KEY = "pos_products_v1";
const SALES_KEY = "pos_sales_v1";

/* =========================
   THEME BOOT (NO FLASH)
========================= */
const THEME_KEY = "dash_theme";
(function bootThemeNoFlash() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === "light" ? "light" : "dark";
    const root = document.documentElement;

    root.style.visibility = "hidden";
    root.setAttribute("data-bs-theme", theme);

    if (document.body) {
      document.body.classList.toggle("theme-light", theme === "light");
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => document.body?.classList.toggle("theme-light", theme === "light"),
        { once: true }
      );
    }

    requestAnimationFrame(() => (root.style.visibility = ""));
  } catch {
    document.documentElement.style.visibility = "";
  }
})();

/* ---------- Storage local ---------- */
function jget(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function jset(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function getSession() { return jget(SESSION_KEY, null); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getUsers() { return jget(USERS_KEY, []); }
function getBusinessesLocal() { return jget(BUSINESSES_KEY, []); }
function getBusinessByOwnerLocal(userId) {
  return getBusinessesLocal().find(b => b.ownerUserId === userId) || null;
}

/* =========================
   SUPABASE: BUSINESS + LOGO
========================= */
async function getBusinessByOwnerSB(ownerId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, handle, category, owner_id, logo_url, currency, timezone, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
function getPublicLogoUrlFromBiz(biz) {
  return biz?.logo_url || "";
}

/* =========================
   Theme Button
========================= */
function setupThemeBtn() {
  const btn = document.getElementById("btnTheme");
  if (!btn) return;

  const root = document.documentElement;

  const paint = (theme) => {
    const isLight = theme === "light";
    btn.innerHTML = isLight
      ? '<i class="bi bi-moon-stars"></i>'
      : '<i class="bi bi-sun"></i>';
  };

  const apply = (theme) => {
    const t = theme === "light" ? "light" : "dark";
    root.setAttribute("data-bs-theme", t);
    document.body.classList.toggle("theme-light", t === "light");
    localStorage.setItem(THEME_KEY, t);
    paint(t);
  };

  paint(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const now = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    apply(now === "light" ? "dark" : "light");
  });
}

/* =========================
   Auth (Supabase primero)
========================= */
async function requireAuthOrRedirect() {
  // 1) Supabase
  try {
    const { data, error } = await supabase.auth.getUser();
    const sbUser = data?.user;

    if (sbUser && !error) {
      let biz = null;
      try { biz = await getBusinessByOwnerSB(sbUser.id); }
      catch (e) { console.error("getBusinessByOwnerSB error:", e); biz = null; }

      return {
        user: {
          id: sbUser.id,
          email: sbUser.email,
          name:
            sbUser.user_metadata?.full_name ||
            sbUser.user_metadata?.name ||
            sbUser.email ||
            "Usuario",
        },
        biz,
        auth: "supabase",
      };
    }
  } catch (e) {
    console.error("supabase.auth.getUser error:", e);
  }

  // 2) Fallback localStorage
  const session = getSession();
  if (!session?.userId) {
    window.location.href = "Index.html";
    return null;
  }

  const user = getUsers().find(u => u.id === session.userId);
  if (!user) {
    clearSession();
    window.location.href = "Index.html";
    return null;
  }

  const biz = getBusinessByOwnerLocal(session.userId) || null;
  return { user, biz, auth: "local" };
}

/* ---------- Backward compatible (bizId/businessId) ---------- */
function normalizeProduct(p) {
  if (!p) return p;
  if (!p.bizId && p.businessId) p.bizId = p.businessId;
  return p;
}
function normalizeSale(s) {
  if (!s) return s;
  if (!s.bizId && s.businessId) s.bizId = s.businessId;
  return s;
}

// Local products
function getAllProducts() { return jget(PRODUCTS_KEY, []).map(normalizeProduct); }
function getProductsByBiz(bizId) { return getAllProducts().filter(p => p.bizId === bizId); }

// Sales local (fallback)
function getAllSales() { return jget(SALES_KEY, []).map(normalizeSale); }
function getSalesByBiz(bizId) { return getAllSales().filter(s => s.bizId === bizId); }

/* =========================
   SUPABASE PRODUCTS
========================= */
function mapRowToLocalLikeProduct(row) {
  return {
    id: row.id,
    bizId: row.business_id,
    name: row.name || "",
    sku: row.sku || "",
    barcode: row.barcode || "",
    unit: row.unit || "pz",
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    trackStock: true,
    image_url: row.image_url || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function fetchProductsSB(bizId) {
  const { data, error } = await supabase
    .from("products")
    .select("id,business_id,sku,barcode,name,unit,price,stock,image_url,created_at,updated_at,is_active")
    .eq("business_id", bizId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToLocalLikeProduct);
}

/* =========================
   TIMEZONE: rangos "hoy/ayer"
========================= */
function getTZParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

function dayRangeUtcISO(timeZone, daysAgo = 0) {
  const now = new Date();

  const tzNowParts = getTZParts(now, timeZone);
  const y = Number(tzNowParts.year);
  const m = Number(tzNowParts.month);
  const d = Number(tzNowParts.day);

  const baseUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  baseUTC.setUTCDate(baseUTC.getUTCDate() - daysAgo);

  const baseParts = getTZParts(baseUTC, timeZone);
  const asIfUTC = new Date(Date.UTC(
    Number(baseParts.year),
    Number(baseParts.month) - 1,
    Number(baseParts.day),
    Number(baseParts.hour),
    Number(baseParts.minute),
    Number(baseParts.second)
  ));

  const offsetMs = baseUTC.getTime() - asIfUTC.getTime();
  const start = new Date(baseUTC.getTime() + offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/* =========================
   SUPABASE SALES (sales + sale_items)
========================= */
async function fetchSalesSBByRange(bizId, startISO, endISO) {
  const { data, error } = await supabase
    .from("sales")
    .select(`
      id,
      business_id,
      created_at,
      created_by,
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
    .eq("business_id", bizId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/* =========================
   Utils
========================= */
function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function toMs(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
function startOfDayMs(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function relativeDayLabelFromValue(value) {
  const ms = toMs(value);
  if (!ms) return "—";
  const now = Date.now();
  const diffDays = Math.round((startOfDayMs(ms) - startOfDayMs(now)) / 86400000);
  if (diffDays === 0) return "hoy";
  if (diffDays === -1) return "ayer";
  if (diffDays === -2) return "antier";
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  return rtf.format(diffDays, "day");
}
function shortId(uuid) {
  try { return String(uuid).split("-")[0].toUpperCase(); } catch { return String(uuid || ""); }
}
function bsModal(el) {
  if (!el) return null;
  return bootstrap.Modal.getOrCreateInstance(el);
}

/* =========================
   STATE
========================= */
let ctx = null;
let products = [];
let sales = [];
let cart = [];

// checkout flow state
let pendingCheckout = null; // { pm, ref }

/* ---------- DOM ---------- */
const brandLogoImg = document.getElementById("brandLogoImg");
const brandNameText = document.getElementById("brandNameText");

const productSearch = document.getElementById("productSearch");
const productList = document.getElementById("productList");
const salesList = document.getElementById("salesList");

const posSearch = document.getElementById("posSearch");
const cartList = document.getElementById("cartList");

const subtotalLabel = document.getElementById("subtotalLabel");
const totalLabel = document.getElementById("totalLabel");
const discountInput = document.getElementById("discountInput");

const paymentMethod = document.getElementById("paymentMethod");
const posMsg = document.getElementById("posMsg");

const btnClearCart = document.getElementById("btnClearCart");
const btnCheckout = document.getElementById("btnCheckout");
const confirmLogout = document.getElementById("confirmLogout");

/* --- Modal: referencia --- */
const paymentRefModalEl = document.getElementById("paymentRefModal");
const paymentRefModalInput = document.getElementById("paymentRefModalInput");
const btnRefNext = document.getElementById("btnRefNext");
const paymentRefHelp = document.getElementById("paymentRefHelp");

/* --- Checkout choice modal --- */
const checkoutChoiceModalEl = document.getElementById("checkoutChoiceModal");
const btnPayNoTicket = document.getElementById("btnPayNoTicket");
const btnPayWithTicket = document.getElementById("btnPayWithTicket");

/* --- Receipt modal --- */
const receiptModalEl = document.getElementById("receiptModal");
const rmBizName = document.getElementById("rmBizName");
const rmDate = document.getElementById("rmDate");
const rmFolio = document.getElementById("rmFolio");
const rmTotal = document.getElementById("rmTotal");
const rmQR = document.getElementById("rmQR");
const rmOpenLink = document.getElementById("rmOpenLink");
const rmCopyLink = document.getElementById("rmCopyLink");
const rmThanks = document.getElementById("rmThanks");

/* ---------- UI helpers ---------- */
function setPosMsg(msg, ok = false) {
  if (!posMsg) return;
  posMsg.textContent = msg;
  posMsg.classList.remove("d-none");
  posMsg.classList.toggle("alert-danger", !ok);
  posMsg.classList.toggle("alert-success", ok);
}
function clearPosMsg() {
  if (!posMsg) return;
  posMsg.textContent = "";
  posMsg.classList.add("d-none");
  posMsg.classList.remove("alert-success");
  posMsg.classList.add("alert-danger");
}

/* =========================
   Cobrar habilitado/inhabilitado
========================= */
function updateCheckoutEnabled() {
  if (!btnCheckout) return;
  const disabled = cart.length === 0;
  btnCheckout.disabled = disabled;
  btnCheckout.classList.toggle("disabled", disabled);
}

/* =========================
   Render Biz + Logo
========================= */
function renderBiz() {
  const name = ctx?.biz?.name || "Mi POS";
  if (brandNameText) brandNameText.textContent = name;

  const logoUrl = getPublicLogoUrlFromBiz(ctx?.biz);
  if (brandLogoImg) {
    if (logoUrl) {
      brandLogoImg.src = logoUrl;
      brandLogoImg.classList.remove("d-none");
    } else {
      brandLogoImg.classList.add("d-none");
    }
  }
}

/* =========================
   LOAD PRODUCTS
========================= */
async function loadProducts() {
  if (!ctx?.biz?.id) { products = []; return; }

  if (ctx.auth === "supabase") {
    try {
      products = await fetchProductsSB(ctx.biz.id);
      return;
    } catch (e) {
      console.error("fetchProductsSB error:", e);
      products = [];
      setPosMsg(`Productos SB error: ${e?.message || e}`, false);
      return;
    }
  }

  products = getProductsByBiz(ctx.biz.id);
}

/* =========================
   LOAD SALES (HOY + AYER)
========================= */
async function loadSalesSB() {
  if (!ctx?.biz?.id) { sales = []; return; }

  const tz = ctx.biz.timezone || "America/Mexico_City";
  try {
    const today = dayRangeUtcISO(tz, 0);
    const yesterday = dayRangeUtcISO(tz, 1);

    const [sToday, sYest] = await Promise.all([
      fetchSalesSBByRange(ctx.biz.id, today.startISO, today.endISO),
      fetchSalesSBByRange(ctx.biz.id, yesterday.startISO, yesterday.endISO),
    ]);

    sales = [...sToday, ...sYest];
  } catch (e) {
    console.error("loadSalesSB error:", e);
    setPosMsg(`Ventas SB error: ${e?.message || e}`, false);
    sales = [];
  }
}

/* =========================
   Render products
========================= */
function renderProducts(filterText = "") {
  const q = filterText.trim().toLowerCase();
  const list = products
    .filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (!productList) return;
  productList.innerHTML = "";

  if (list.length === 0) {
    productList.innerHTML = `<div class="muted small">No hay productos todavía.</div>`;
    return;
  }

  for (const p of list) {
    const img = p.image_url ? `
      <img src="${escapeHtml(p.image_url)}"
           alt="img"
           loading="lazy"
           style="width:44px;height:44px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.12);" />
    ` : `
      <div style="width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
                  display:grid;place-items:center;color:rgba(233,238,245,.65);font-size:12px;">
        <i class="bi bi-image"></i>
      </div>
    `;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="d-flex align-items-center gap-2" style="min-width:0;">
        ${img}
        <div style="min-width:0;">
          <div class="item-title text-truncate">${escapeHtml(p.name)}</div>
          <div class="item-sub">
            ${money(p.price)} • Stock: ${Number(p.stock || 0)} ${p.sku ? "• " + escapeHtml(p.sku) : ""}
          </div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-soft btn-sm" data-act="add" data-id="${p.id}">+ Carrito</button>
      </div>
    `;
    productList.appendChild(el);
  }
}

/* =========================
   Render sales (simple)
========================= */
function renderSales() {
  if (!salesList) return;

  salesList.innerHTML = "";
  if (!sales.length) {
    salesList.innerHTML = `<div class="muted small">Sin ventas (hoy/ayer).</div>`;
    return;
  }

  for (const s of sales) {
    const label = relativeDayLabelFromValue(s.created_at);
    const itemsCount = (s.sale_items || []).length;
    const note = s.note ? ` • ${escapeHtml(String(s.note))}` : "";

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div style="min-width:0;">
        <div class="item-title text-truncate">${escapeHtml(label)} • ${new Date(s.created_at).toLocaleString("es-MX")}</div>
        <div class="item-sub">${escapeHtml(String(s.payment_method || "cash"))}${note} • ${itemsCount} items</div>
      </div>
      <div class="fw-semibold">${money(s.total)}</div>
    `;
    salesList.appendChild(el);
  }
}

/* =========================
   Cart + Totals
========================= */
function updateTotals() {
  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const discount = Math.max(0, Number(discountInput?.value || 0));
  const total = Math.max(0, subtotal - discount);

  if (subtotalLabel) subtotalLabel.textContent = money(subtotal);
  if (totalLabel) totalLabel.textContent = money(total);
}

function renderCart() {
  if (!cartList) return;
  cartList.innerHTML = "";

  if (cart.length === 0) {
    cartList.innerHTML = `<div class="muted small">Carrito vacío. Busca y presiona Enter.</div>`;
    updateTotals();
    updateCheckoutEnabled();
    return;
  }

  for (const item of cart) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(item.name)}</div>
        <div class="item-sub">${money(item.price)} c/u</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-soft btn-sm" data-act="dec" data-id="${item.productId}">-</button>
        <span class="badge badge-soft">${item.qty}</span>
        <button class="btn btn-soft btn-sm" data-act="inc" data-id="${item.productId}">+</button>
        <button class="btn btn-outline-danger btn-sm" data-act="rm" data-id="${item.productId}">Quitar</button>
      </div>
    `;
    cartList.appendChild(el);
  }

  updateTotals();
  updateCheckoutEnabled();
}

/* ---------- Cart actions ---------- */
function addToCart(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;

  if (Number(p.stock) <= 0) return setPosMsg("No hay stock de ese producto.");

  const item = cart.find(x => x.productId === productId);
  const currentQty = item ? item.qty : 0;

  if (currentQty + 1 > Number(p.stock)) return setPosMsg("No puedes agregar más, excede el stock.");

  clearPosMsg();
  if (!item) cart.push({ productId: p.id, name: p.name, price: p.price, qty: 1 });
  else item.qty += 1;

  renderCart();
}
function incCart(productId) {
  const item = cart.find(x => x.productId === productId);
  if (!item) return;

  const p = products.find(x => x.id === productId);
  if (!p) return;

  if (item.qty + 1 > Number(p.stock)) return setPosMsg("No puedes agregar más, excede el stock.");

  clearPosMsg();
  item.qty += 1;
  renderCart();
}
function decCart(productId) {
  const item = cart.find(x => x.productId === productId);
  if (!item) return;

  clearPosMsg();
  item.qty -= 1;
  cart = cart.filter(x => x.qty > 0);
  renderCart();
}
function removeFromCart(productId) {
  clearPosMsg();
  cart = cart.filter(x => x.productId !== productId);
  renderCart();
}
function clearCart() {
  clearPosMsg();
  cart = [];
  renderCart();
}

/* =========================
   PAGO + REFERENCIA (SOLO MODAL)
========================= */
function normalizePaymentMethod(val) {
  const v = String(val || "").trim().toLowerCase();
  if (v === "efectivo" || v === "cash") return "cash";
  if (v === "tarjeta" || v === "card") return "card";
  if (v === "transferencia" || v === "transfer") return "transfer";
  if (v === "mixto" || v === "mixed") return "mixed";
  return "cash";
}
function pmNeedsRef(pm) {
  return pm === "card" || pm === "transfer" || pm === "mixed";
}
function pmLabel(pm) {
  if (pm === "card") return "Tarjeta";
  if (pm === "transfer") return "Transferencia";
  if (pm === "mixed") return "Mixto";
  return "Efectivo";
}

function openPaymentRefModal(pm) {
  if (!paymentRefModalEl || !paymentRefModalInput || !btnRefNext) {
    setPosMsg("Falta el modal de referencia (#paymentRefModal / #paymentRefModalInput / #btnRefNext).", false);
    return;
  }

  clearPosMsg();
  if (paymentRefHelp) {
    paymentRefHelp.textContent = `Pago con ${pmLabel(pm)} — escribe el folio/referencia`;
  }

  paymentRefModalInput.value = "";
  paymentRefModalEl.addEventListener(
    "shown.bs.modal",
    () => paymentRefModalInput.focus(),
    { once: true }
  );

  bsModal(paymentRefModalEl)?.show();
}

function openCheckoutChoice() {
  if (cart.length === 0) return;
  if (ctx?.auth !== "supabase") {
    return setPosMsg("Este POS está en modo local. Activa Supabase para tickets QR.", false);
  }
  bsModal(checkoutChoiceModalEl)?.show();
}

function openCheckoutFlow() {
  if (cart.length === 0) return;

  const pm = normalizePaymentMethod(paymentMethod?.value || "cash");
  pendingCheckout = { pm, ref: "" };

  if (pmNeedsRef(pm)) return openPaymentRefModal(pm);
  openCheckoutChoice();
}

/* =========================
   RECIBO DIGITAL (token)
========================= */
let lastReceiptUrl = "";

async function createReceiptTokenSB({ saleId, businessId, userId }) {
  const token = crypto.randomUUID().replaceAll("-", "");
  const payload = { token, sale_id: saleId, business_id: businessId, created_by: userId };

  const { error } = await supabase.from("receipt_links").insert([payload]);
  if (error) throw error;

  return token;
}

function receiptUrlFromToken(token) {
  return `${location.origin}/recibo.html?t=${encodeURIComponent(token)}`;
}

async function showReceiptModal({ bizName, createdAt, saleId, total, url, paymentRef }) {
  if (rmBizName) rmBizName.textContent = bizName || "Mi POS";

  const dt = new Date(createdAt).toLocaleString("es-MX");
  const folio = shortId(saleId);

  if (rmDate) {
    rmDate.textContent = paymentRef
      ? `${dt} • Ref: ${paymentRef}`
      : dt;
  }

  if (rmFolio) rmFolio.textContent = `Folio: ${folio}`;
  if (rmTotal) rmTotal.textContent = money(total);
  if (rmThanks) rmThanks.textContent = `¡Gracias por tu compra! — ${bizName || "Mi POS"}`;

  if (rmOpenLink) rmOpenLink.href = url;

  try {
    if (window.QRCode && rmQR) {
      await window.QRCode.toCanvas(rmQR, url, { margin: 1, width: 230 });
    } else {
      setPosMsg("Falta qrcode.min.js (window.QRCode).", false);
    }
  } catch (e) {
    console.error("QR error:", e);
    setPosMsg("No pude generar el QR (revisa qrcode.js).", false);
  }

  if (rmCopyLink) {
    rmCopyLink.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setPosMsg("Link copiado ✅", true);
        setTimeout(clearPosMsg, 1200);
      } catch {
        setPosMsg("No pude copiar 😅", false);
      }
    };
  }

  bsModal(receiptModalEl)?.show();
}

/* =========================
   CHECKOUT (Supabase)
   - Guarda referencia en sales.note (porque no existe payment_ref)
========================= */
async function checkoutSupabase({ withTicket }) {
  clearPosMsg();
  if (cart.length === 0) return setPosMsg("Carrito vacío.");
  if (!ctx?.biz?.id) return setPosMsg("No se encontró tu empresa.");

  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const discount = Math.max(0, Number(discountInput?.value || 0));
  const total = Math.max(0, subtotal - discount);
  if (total <= 0) return setPosMsg("El total debe ser mayor a 0.");

  const pm = pendingCheckout?.pm || normalizePaymentMethod(paymentMethod?.value || "cash");
  const ref = String(pendingCheckout?.ref || "").trim();

  if (pmNeedsRef(pm) && !ref) return setPosMsg("Falta la referencia del pago.", false);

  try {
    const note = pmNeedsRef(pm) ? `Ref: ${ref}` : null;

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert([{
        business_id: ctx.biz.id,
        created_by: ctx.user.id,
        status: "paid",
        payment_method: pm,
        subtotal,
        discount,
        tax: 0,
        total,
        note,
      }])
      .select("id, created_at, payment_method, subtotal, discount, total, note")
      .single();

    if (saleErr) throw saleErr;

    const itemsPayload = cart.map(it => ({
      sale_id: sale.id,
      product_id: it.productId,
      name: it.name,
      qty: Number(it.qty),
      unit_price: Number(it.price),
      cost: 0,
      line_total: Number(it.price) * Number(it.qty),
    }));

    const { error: itemsErr } = await supabase.from("sale_items").insert(itemsPayload);
    if (itemsErr) throw itemsErr;

    cart = [];
    pendingCheckout = null;
    if (discountInput) discountInput.value = "0";

    renderCart();
    renderProducts(productSearch?.value || "");

    await loadSalesSB();
    renderSales();

    setPosMsg(`Venta registrada ✅ ${money(total)}`, true);
    setTimeout(clearPosMsg, 1400);

    if (!withTicket) return;

    const token = await createReceiptTokenSB({
      saleId: sale.id,
      businessId: ctx.biz.id,
      userId: ctx.user.id
    });

    lastReceiptUrl = receiptUrlFromToken(token);

    await showReceiptModal({
      bizName: ctx.biz.name || "Mi POS",
      createdAt: sale.created_at,
      saleId: sale.id,
      total: sale.total,
      url: lastReceiptUrl,
      paymentRef: pmNeedsRef(pm) ? ref : ""
    });

  } catch (e) {
    console.error("checkout error:", e);
    setPosMsg(`Checkout error: ${e?.message || e}`, false);
  }
}

/* ---------- Logout ---------- */
function wireLogout() {
  confirmLogout?.addEventListener("click", async () => {
    try { await supabase.auth.signOut(); } catch {}
    clearSession();
    window.location.href = "Index.html";
  });
}

/* ---------- Events ---------- */
function wireEvents() {
  productSearch?.addEventListener("input", () => renderProducts(productSearch.value));

  productList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (!id || !act) return;
    if (act === "add") addToCart(id);
  });

  posSearch?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = (posSearch.value || "").trim().toLowerCase();
    if (!q) return;

    const first = products.find(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.barcode || "").toLowerCase() === q
    );
    if (!first) return setPosMsg("No encontré ese producto.");

    addToCart(first.id);
    posSearch.value = "";
  });

  cartList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (!id || !act) return;

    if (act === "inc") incCart(id);
    if (act === "dec") decCart(id);
    if (act === "rm") removeFromCart(id);
  });

  discountInput?.addEventListener("input", updateTotals);
  btnClearCart?.addEventListener("click", clearCart);

  // ✅ cobrar (flow)
  btnCheckout?.addEventListener("click", openCheckoutFlow);

  // ✅ modal ref -> continuar
  btnRefNext?.addEventListener("click", () => {
    const pm = pendingCheckout?.pm || normalizePaymentMethod(paymentMethod?.value || "cash");
    const ref = String(paymentRefModalInput?.value || "").trim();

    if (pmNeedsRef(pm) && !ref) {
      setPosMsg("Escribe la referencia/folio para continuar.", false);
      paymentRefModalInput?.focus();
      return;
    }

    pendingCheckout = { pm, ref };
    bsModal(paymentRefModalEl)?.hide();
    openCheckoutChoice();
  });

  // ✅ Enter en input modal ref
  paymentRefModalInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnRefNext?.click();
    }
  });

  // choice buttons
  btnPayNoTicket?.addEventListener("click", async () => {
    bsModal(checkoutChoiceModalEl)?.hide();
    await checkoutSupabase({ withTicket: false });
  });

  btnPayWithTicket?.addEventListener("click", async () => {
    bsModal(checkoutChoiceModalEl)?.hide();
    await checkoutSupabase({ withTicket: true });
  });

  wireLogout();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  setupThemeBtn();

  ctx = await requireAuthOrRedirect();
  if (!ctx) return;

  if (ctx.auth === "supabase" && !ctx.biz?.id) {
    try { ctx.biz = await getBusinessByOwnerSB(ctx.user.id); } catch {}
  }

  renderBiz();

  await loadProducts();

  if (ctx.auth === "supabase") await loadSalesSB();
  else sales = ctx.biz?.id ? getSalesByBiz(ctx.biz.id) : [];

  renderSales();
  renderProducts("");
  renderCart();
  updateCheckoutEnabled();

  wireEvents();
});
