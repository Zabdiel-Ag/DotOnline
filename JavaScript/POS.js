/* =========================
   POS.js (LIMPIO / SIN DUPLICADOS)
   Keys reales:
   PRODUCTS_KEY = "pos_products_v1"
   SALES_KEY    = "pos_sales_v1"
   ========================= */

const USERS_KEY = "pos_users";
const SESSION_KEY = "pos_session";
const BUSINESSES_KEY = "pos_businesses";
const PRODUCTS_KEY = "pos_products_v1";
const SALES_KEY = "pos_sales_v1";

// ---------- Storage ----------
function jget(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function jset(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function getSession() { return jget(SESSION_KEY, null); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getUsers() { return jget(USERS_KEY, []); }
function getBusinesses() { return jget(BUSINESSES_KEY, []); }

function getBusinessByOwner(userId) {
  return getBusinesses().find(b => b.ownerUserId === userId) || null;
}

function requireAuth() {
  const session = getSession();
  if (!session?.userId) { window.location.href = "Index.html"; return null; }

  const user = getUsers().find(u => u.id === session.userId);
  if (!user) { clearSession(); window.location.href = "Index.html"; return null; }

  const biz = getBusinessByOwner(session.userId);
  if (!biz) { window.location.href = "Index.html"; return null; }

  return { user, biz };
}

// Backward compatible (bizId/businessId)
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

// Products
function getAllProducts() { return jget(PRODUCTS_KEY, []).map(normalizeProduct); }
function saveAllProducts(all) { jset(PRODUCTS_KEY, all); }
function getProductsByBiz(bizId) { return getAllProducts().filter(p => p.bizId === bizId); }

// Sales
function getAllSales() { return jget(SALES_KEY, []).map(normalizeSale); }
function saveAllSales(all) { jset(SALES_KEY, all); }
function getSalesByBiz(bizId) { return getAllSales().filter(s => s.bizId === bizId); }

// ---------- Utils ----------
function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
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
  return rtf.format(diffDays, "day"); // "hace 7 días"
}
function isToday(value) {
  const ms = toMs(value);
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ---------- State ----------
let ctx = null; // {user,biz}
let products = [];
let sales = [];
let cart = []; // {productId,name,price,qty}

// ---------- DOM ----------
const bizLabel = document.getElementById("bizLabel");
const todayTotalChip = document.getElementById("todayTotalChip");

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

// Product modal
const productModalEl = document.getElementById("productModal");
const productModal = (productModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(productModalEl)
  : null;

const btnOpenProductModal = document.getElementById("btnOpenProductModal");
const btnSaveProductModal = document.getElementById("btnSaveProductModal");
const productModalTitle = document.getElementById("productModalTitle");
const productModalError = document.getElementById("productModalError");

const pmName = document.getElementById("pmName");
const pmSku = document.getElementById("pmSku");
const pmPrice = document.getElementById("pmPrice");
const pmStock = document.getElementById("pmStock");
const pmUnit = document.getElementById("pmUnit");
const pmTrackStock = document.getElementById("pmTrackStock");

const pmSkuManual = document.getElementById("pmSkuManual");
const btnGenSku = document.getElementById("btnGenSku");

// Logout modal
const btnLogoutDash = document.getElementById("btnLogoutDash");
const logoutModalEl = document.getElementById("logoutModal");
const confirmLogout = document.getElementById("confirmLogout");
const logoutModal = (logoutModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(logoutModalEl)
  : null;

// ---------- UI helpers ----------
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function hideError(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}
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

// ---------- Render ----------
function renderBiz() {
  if (bizLabel) bizLabel.textContent = `${ctx.biz.name}  •  @${ctx.biz.handle}`;
}

function renderProducts(filterText = "") {
  const q = filterText.trim().toLowerCase();
  const list = products
    .filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (!productList) return;
  productList.innerHTML = "";

  if (list.length === 0) {
    productList.innerHTML = `<div class="muted small">No hay productos todavía (crea en Inventario y aquí aparecerán).</div>`;
    return;
  }

  for (const p of list) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(p.name)}</div>
        <div class="item-sub">
          ${money(p.price)} • Stock: ${Number(p.stock || 0)} ${p.sku ? "• " + escapeHtml(p.sku) : ""}
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-soft btn-sm" data-act="add" data-id="${p.id}">+ Carrito</button>
        <button class="btn btn-outline-danger btn-sm" data-act="del" data-id="${p.id}">X</button>
      </div>
    `;
    productList.appendChild(el);
  }
}

function renderCart() {
  if (!cartList) return;
  cartList.innerHTML = "";

  if (cart.length === 0) {
    cartList.innerHTML = `<div class="muted small">Carrito vacío. Busca un producto y presiona Enter.</div>`;
    updateTotals();
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
}

function renderTodayTotal() {
  if (!todayTotalChip) return;
  const totalToday = sales
    .filter(s => isToday(s.createdAt))
    .reduce((acc, s) => acc + Number(s.total || 0), 0);

  todayTotalChip.textContent = `${money(totalToday)} hoy`;
}

function saleItemsPreview(items = []) {
  const max = 2;
  const parts = items.slice(0, max).map(it => `${it.name || "Producto"} x${Number(it.qty || 1)}`);
  const rest = items.length - max;
  return parts.join(", ") + (rest > 0 ? ` +${rest} más` : "");
}

/* ==========
   Ventas recientes (sin bug)
   - chip: hoy/ayer/antier/hace X días ✅
   - orden por fecha real ✅
   - desglose opcional ✅ (si existen ids)
   ========== */
function renderSales() {
  if (!salesList) return;

  const sorted = [...sales].sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
  const recent = sorted.slice(0, 8);

  if (recent.length === 0) {
    salesList.innerHTML = `<div class="muted">Aún no hay ventas.</div>`;
    renderTodayTotal();
    renderSalesBreakdown(sorted);
    return;
  }

  salesList.innerHTML = recent.map(s => {
    const whenMs = toMs(s.createdAt);
    const when = whenMs ? new Date(whenMs) : new Date();
    const hh = String(when.getHours()).padStart(2, "0");
    const mm = String(when.getMinutes()).padStart(2, "0");

    const items = Array.isArray(s.items) ? s.items : [];
    const itemsCount = items.reduce((a, x) => a + Number(x.qty || 0), 0);

    const collapseId = `sale_${String(s.id || "").replaceAll("-", "") || Math.random().toString(16).slice(2)}`;
    const dayLabel = relativeDayLabelFromValue(s.createdAt);

    return `
      <div class="item">
        <div style="min-width:0;">
          <div class="item-title">
            ${money(s.total)}
            <span class="muted">(${escapeHtml(s.method || "Efectivo")})</span>
          </div>
          <div class="item-sub">
            ${when.toLocaleDateString("es-MX")} ${hh}:${mm} • ${itemsCount} artículos
            <span class="muted">• ${escapeHtml(saleItemsPreview(items))}</span>
          </div>

          <div class="collapse mt-2" id="${collapseId}">
            <div class="small muted">
              ${items.map(it => `
                <div class="d-flex justify-content-between">
                  <span>${escapeHtml(it.name || "Producto")} <span class="muted">x${Number(it.qty || 1)}</span></span>
                  <span>${money(Number(it.price || 0) * Number(it.qty || 1))}</span>
                </div>
              `).join("")}
              <hr style="border-color: rgba(255,255,255,.10);" class="my-2" />
              <div class="d-flex justify-content-between">
                <span>Subtotal</span><span>${money(s.subtotal)}</span>
              </div>
              <div class="d-flex justify-content-between">
                <span>Descuento</span><span>${money(s.discount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex flex-column align-items-end gap-2">
          <span class="chip">${dayLabel}</span>
          <button class="btn btn-soft btn-sm"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#${collapseId}">
            Detalles
          </button>
        </div>
      </div>
    `;
  }).join("");

  renderTodayTotal();
  renderSalesBreakdown(sorted);
}

/* ==========
   Desglose (opcional)
   Si tu HTML tiene estos IDs:
   - sumIngresosHoy, sumTicketsHoy, sumUltimaVenta, sumArticulosHoy, salesTodayList
   Se llena; si no, no pasa nada.
   ========== */
function renderSalesBreakdown(sortedSales) {
  const now = Date.now();
  const today0 = startOfDayMs(now);

  const todaySales = sortedSales.filter(s => (toMs(s.createdAt) || 0) >= today0);

  const ingresosHoy = todaySales.reduce((acc, s) => acc + Number(s.total || 0), 0);
  const ticketsHoy = todaySales.length;
  const articulosHoy = todaySales.reduce((acc, s) => {
    const items = Array.isArray(s.items) ? s.items : [];
    return acc + items.reduce((a, it) => a + Number(it.qty || 0), 0);
  }, 0);
  const ultimaMs = todaySales[0] ? toMs(todaySales[0].createdAt) : null;

  setText("sumIngresosHoy", money(ingresosHoy));
  setText("sumTicketsHoy", ticketsHoy ? String(ticketsHoy) : "—");
  setText("sumArticulosHoy", articulosHoy ? String(articulosHoy) : "—");
  setText("sumUltimaVenta", ultimaMs
    ? new Date(ultimaMs).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "—"
  );

  const todayList = document.getElementById("salesTodayList");
  if (!todayList) return;

  if (!todaySales.length) {
    todayList.innerHTML = `<div class="muted">Hoy no hay ventas todavía.</div>`;
    return;
  }

  todayList.innerHTML = todaySales.slice(0, 20).map(s => {
    const ms = toMs(s.createdAt);
    const t = ms ? new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const itemsCount = (s.items || []).reduce((a, x) => a + Number(x.qty || 0), 0);
    return `
      <div class="item">
        <div>
          <div class="item-title">Venta <span class="muted tiny">• ${t}</span></div>
          <div class="item-sub">${itemsCount} artículos • ${escapeHtml(s.method || "Efectivo")}</div>
        </div>
        <div class="fw-semibold">${money(s.total)}</div>
      </div>
    `;
  }).join("");
}

// ---------- Totals ----------
function updateTotals() {
  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const discount = Math.max(0, Number(discountInput?.value || 0));
  const total = Math.max(0, subtotal - discount);

  if (subtotalLabel) subtotalLabel.textContent = money(subtotal);
  if (totalLabel) totalLabel.textContent = money(total);
}

// ---------- SKU helpers ----------
function sanitizeSkuPart(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function randomBase36(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}
function skuExistsInBiz(sku) {
  const s = String(sku || "").trim().toLowerCase();
  return products.some(p => (p.sku || "").trim().toLowerCase() === s);
}
function generateSkuFromName(name) {
  const base = sanitizeSkuPart(name).slice(0, 12) || "PROD";
  return `${base}-${randomBase36(4)}`;
}
function generateUniqueSku(name) {
  let sku = generateSkuFromName(name);
  let tries = 0;
  while (skuExistsInBiz(sku) && tries < 25) { sku = generateSkuFromName(name); tries++; }
  return sku;
}
function setSkuAutoFromName() {
  if (!pmSku || !pmName) return;
  if (pmSkuManual?.checked) return;
  pmSku.value = generateUniqueSku(pmName.value);
}

// ---------- Product modal ----------
function openNewProduct() {
  clearPosMsg();
  if (!productModal) return setPosMsg("Falta el modal de producto en el HTML.", false);

  hideError(productModalError);
  if (productModalTitle) productModalTitle.textContent = "Nuevo producto";

  pmName.value = "";
  pmPrice.value = "";
  pmStock.value = "";
  pmUnit.value = "";
  if (pmTrackStock) pmTrackStock.checked = true;

  if (pmSkuManual) pmSkuManual.checked = false;
  if (pmSku) {
    pmSku.disabled = true;
    pmSku.value = generateUniqueSku("");
  }

  productModal.show();
}

function saveProductFromModal() {
  hideError(productModalError);

  const name = (pmName?.value || "").trim();
  let sku = (pmSku?.value || "").trim();
  const unit = (pmUnit?.value || "").trim();
  const price = Number(pmPrice?.value || 0);
  const stock = Number(pmStock?.value || 0);
  const trackStock = pmTrackStock ? !!pmTrackStock.checked : true;

  if (name.length < 2) return showError(productModalError, "Nombre inválido.");
  if (!Number.isFinite(price) || price < 0) return showError(productModalError, "Precio inválido.");
  if (!Number.isFinite(stock) || stock < 0) return showError(productModalError, "Stock inválido.");

  if (!pmSkuManual?.checked) {
    sku = generateUniqueSku(name);
  } else {
    if (sku) {
      const exists = products.some(p => (p.sku || "").toLowerCase() === sku.toLowerCase());
      if (exists) return showError(productModalError, "Ese SKU ya existe.");
    }
  }

  const all = getAllProducts();
  all.push({
    id: crypto.randomUUID(),
    bizId: ctx.biz.id,
    name,
    sku,
    unit,
    price,
    stock: Math.floor(stock),
    trackStock,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  saveAllProducts(all);

  products = getProductsByBiz(ctx.biz.id);
  renderProducts(productSearch?.value || "");
  productModal.hide();
}

function deleteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  if (!confirm(`Eliminar "${p.name}"?`)) return;

  cart = cart.filter(x => x.productId !== id);

  const all = getAllProducts().filter(x => !(x.id === id && x.bizId === ctx.biz.id));
  saveAllProducts(all);

  products = getProductsByBiz(ctx.biz.id);
  renderProducts(productSearch?.value || "");
  renderCart();
}

// ---------- Cart actions ----------
function addToCart(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;

  if (Number(p.stock) <= 0 && (p.trackStock ?? true)) return setPosMsg("No hay stock de ese producto.");

  const item = cart.find(x => x.productId === productId);
  const currentQty = item ? item.qty : 0;

  if ((p.trackStock ?? true) && currentQty + 1 > Number(p.stock)) return setPosMsg("No puedes agregar más, excede el stock.");

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

  if ((p.trackStock ?? true) && item.qty + 1 > Number(p.stock)) return setPosMsg("No puedes agregar más, excede el stock.");

  clearPosMsg();
  item.qty += 1;
  renderCart();
}
function decCart(productId) {
  const item = cart.find(x => x.productId === productId);
  if (!item) return;

  clearPosMsg();
  item.qty -= 1;
  if (item.qty <= 0) cart = cart.filter(x => x.productId === productId ? false : true);
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

// ---------- Checkout ----------
function checkout() {
  clearPosMsg();
  if (cart.length === 0) return setPosMsg("Carrito vacío.");

  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);
  const discount = Math.max(0, Number(discountInput?.value || 0));
  const total = Math.max(0, subtotal - discount);

  if (total <= 0) return setPosMsg("El total debe ser mayor a 0.");

  // validar stock
  for (const it of cart) {
    const p = products.find(x => x.id === it.productId);
    if (!p) return setPosMsg("Un producto ya no existe.");
    if ((p.trackStock ?? true) && Number(it.qty) > Number(p.stock)) return setPosMsg(`Stock insuficiente: ${p.name}`);
  }

  // descontar stock
  const allProducts = getAllProducts();
  for (const it of cart) {
    const idx = allProducts.findIndex(x => x.id === it.productId && x.bizId === ctx.biz.id);
    if (idx !== -1) {
      const track = allProducts[idx].trackStock ?? true;
      if (track) allProducts[idx].stock = Math.max(0, Number(allProducts[idx].stock) - Number(it.qty));
      allProducts[idx].updatedAt = new Date().toISOString();
    }
  }
  saveAllProducts(allProducts);

  // registrar venta
  const sale = {
    id: crypto.randomUUID(),
    bizId: ctx.biz.id,
    createdAt: new Date().toISOString(),
    items: cart.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      qty: item.qty
    })),
    subtotal,
    discount,
    total,
    method: paymentMethod?.value || "Efectivo"
  };

  const allSales = getAllSales();
  allSales.push(sale);
  saveAllSales(allSales);

  // refrescar state
  products = getProductsByBiz(ctx.biz.id);
  sales = getSalesByBiz(ctx.biz.id);

  cart = [];
  if (discountInput) discountInput.value = "0";

  renderProducts(productSearch?.value || "");
  renderCart();
  renderSales();

  setPosMsg(`Venta registrada: ${money(total)}`, true);
  setTimeout(() => clearPosMsg(), 1600);
}

// ---------- Logout ----------
function wireLogout() {
  if (!btnLogoutDash) return;

  if (!logoutModal) {
    btnLogoutDash.addEventListener("click", () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) {
        clearSession();
        window.location.href = "Index.html";
      }
    });
    return;
  }

  btnLogoutDash.addEventListener("click", () => logoutModal.show());
  confirmLogout?.addEventListener("click", () => {
    clearSession();
    window.location.href = "Index.html";
  });
}

// ---------- Events ----------
function wireEvents() {
  btnOpenProductModal?.addEventListener("click", openNewProduct);
  btnSaveProductModal?.addEventListener("click", saveProductFromModal);

  productSearch?.addEventListener("input", () => renderProducts(productSearch.value));

  pmName?.addEventListener("input", setSkuAutoFromName);

  pmSkuManual?.addEventListener("change", () => {
    const manual = !!pmSkuManual.checked;
    if (pmSku) pmSku.disabled = !manual;

    if (!manual) {
      if (pmSku) pmSku.value = generateUniqueSku(pmName?.value || "");
    } else {
      pmSku?.focus();
    }
  });

  btnGenSku?.addEventListener("click", () => {
    if (!pmSku) return;
    pmSku.value = generateUniqueSku(pmName?.value || "");
  });

  productList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (!id || !act) return;

    if (act === "add") addToCart(id);
    if (act === "del") deleteProduct(id);
  });

  posSearch?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = (posSearch.value || "").trim().toLowerCase();
    if (!q) return;

    const first = products.find(p =>
      (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)
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
  btnCheckout?.addEventListener("click", checkout);

  wireLogout();
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  ctx = requireAuth();
  if (!ctx) return;

  renderBiz();

  products = getProductsByBiz(ctx.biz.id);
  sales = getSalesByBiz(ctx.biz.id);

  renderProducts("");
  renderCart();
  renderSales();

  wireEvents();
});

document.addEventListener("DOMContentLoaded", () => {
  const collapseEl = document.getElementById("salesBreakdown");
  const recentWrap = document.getElementById("salesRecentWrap");
  const hint = document.getElementById("salesHint");
  const btn = document.getElementById("btnSalesToggle");

  if (!collapseEl || !recentWrap) return;

  collapseEl.addEventListener("show.bs.collapse", () => {
    recentWrap.classList.add("d-none");
    if (hint) hint.textContent = "Vista detallada";
    if (btn) btn.innerHTML = `<i class="bi bi-chevron-up me-1"></i> Ocultar`;
  });

  collapseEl.addEventListener("hide.bs.collapse", () => {
    recentWrap.classList.remove("d-none");
    if (hint) hint.textContent = "Últimas ventas registradas";
    if (btn) btn.innerHTML = `<i class="bi bi-list-ul me-1"></i> Desglose`;
  });
});

