
const SESSION_KEY = "pos_session";
const USERS_KEY = "pos_users";
const BUSINESSES_KEY = "pos_businesses";
const PRODUCTS_KEY = "pos_products_v1";

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
  const s = getSession();
  if (!s?.userId) { window.location.href = "Index.html"; return null; }
  const u = getUsers().find(x => x.id === s.userId);
  if (!u) { clearSession(); window.location.href = "Index.html"; return null; }
  const biz = getBusinessByOwner(s.userId);
  if (!biz) { window.location.href = "Index.html"; return null; }
  return { user: u, biz };
}

// ✅ Backward compatible: si antes guardaste "businessId", lo convertimos a "bizId"
function normalizeProduct(p) {
  if (!p) return p;
  if (!p.bizId && p.businessId) p.bizId = p.businessId;
  return p;
}

function getAllProducts() {
  const all = jget(PRODUCTS_KEY, []).map(normalizeProduct);
  return all;
}
function saveAllProducts(all) { jset(PRODUCTS_KEY, all); }
function getProductsByBiz(bizId) { return getAllProducts().filter(p => p.bizId === bizId); }

// ===== DOM =====
const bizMini = document.getElementById("bizMini");
const searchInput = document.getElementById("searchInput");
const productsTbody = document.getElementById("productsTbody");
const countLabel = document.getElementById("countLabel");
const emptyState = document.getElementById("emptyState");

const formError = document.getElementById("formError");
const formTitle = document.getElementById("formTitle");

const pName = document.getElementById("pName");
const pSku = document.getElementById("pSku");
const pCategory = document.getElementById("pCategory");
const pPrice = document.getElementById("pPrice");
const pStock = document.getElementById("pStock");
const pUnit = document.getElementById("pUnit");

const btnSaveProduct = document.getElementById("btnSaveProduct");
const btnDeleteProduct = document.getElementById("btnDeleteProduct");
const btnResetForm = document.getElementById("btnResetForm");
const btnSeedDemo = document.getElementById("btnSeedDemo");
const btnClearAll = document.getElementById("btnClearAll");

const btnLogoutInv = document.getElementById("btnLogoutInv");
const logoutModalEl = document.getElementById("logoutModalDash");
const confirmLogoutBtn = document.getElementById("confirmLogoutDash");
const logoutModal = (logoutModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(logoutModalEl)
  : null;

// ===== State =====
let ctx = null;
let products = [];
let editingId = null;

function money(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(msg) {
  if (!formError) return;
  formError.textContent = msg;
  formError.classList.remove("d-none");
}
function hideError() {
  if (!formError) return;
  formError.textContent = "";
  formError.classList.add("d-none");
}

function resetForm() {
  editingId = null;
  hideError();
  if (formTitle) formTitle.textContent = "Agregar producto";

  pName.value = "";
  pSku.value = "";
  pCategory.value = "";
  pPrice.value = "";
  pStock.value = "";
  pUnit.value = "";

  btnDeleteProduct.classList.add("d-none");
}

function loadProducts() {
  products = getProductsByBiz(ctx.biz.id);
}

function renderTable(filter = "") {
  const q = (filter || "").trim().toLowerCase();
  const list = products
    .filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (countLabel) countLabel.textContent = `${list.length} productos`;
  if (emptyState) emptyState.classList.toggle("d-none", list.length !== 0);

  if (!productsTbody) return;
  productsTbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <div class="fw-semibold">${escapeHtml(p.name)}</div>
        <div class="text-secondary small">${escapeHtml(p.unit || "")}</div>
      </td>
      <td class="text-secondary">${escapeHtml(p.sku || "—")}</td>
      <td class="text-secondary">${escapeHtml(p.category || "—")}</td>
      <td class="text-end">${money(p.price)}</td>
      <td class="text-end">${Number(p.stock || 0)}</td>
      <td class="text-end">
        <button class="btn btn-outline-light btn-sm" data-act="edit" data-id="${p.id}">Editar</button>
      </td>
    </tr>
  `).join("");
}

function upsertProduct() {
  hideError();

  const name = (pName.value || "").trim();
  const sku = (pSku.value || "").trim();
  const category = (pCategory.value || "").trim();
  const unit = (pUnit.value || "").trim();
  const price = Number(pPrice.value || 0);
  const stock = Number(pStock.value || 0);

  if (name.length < 2) return showError("Nombre inválido.");
  if (!Number.isFinite(price) || price < 0) return showError("Precio inválido.");
  if (!Number.isFinite(stock) || stock < 0) return showError("Stock inválido.");

  const all = getAllProducts();

  if (!editingId) {
    all.push({
      id: crypto.randomUUID(),
      bizId: ctx.biz.id,          // ✅ clave correcta
      name,
      sku,
      category,
      unit,
      price,
      stock: Math.floor(stock),
      trackStock: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } else {
    const idx = all.findIndex(x => x.id === editingId && (x.bizId === ctx.biz.id || x.businessId === ctx.biz.id));
    if (idx === -1) return showError("No encontré ese producto para editar.");

    all[idx] = {
      ...normalizeProduct(all[idx]),
      bizId: ctx.biz.id,
      name, sku, category, unit, price,
      stock: Math.floor(stock),
      updatedAt: new Date().toISOString()
    };
  }

  saveAllProducts(all);
  loadProducts();
  renderTable(searchInput?.value || "");
  resetForm();
}

function loadToForm(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  hideError();
  if (formTitle) formTitle.textContent = "Editar producto";

  pName.value = p.name || "";
  pSku.value = p.sku || "";
  pCategory.value = p.category || "";
  pPrice.value = String(p.price ?? "");
  pStock.value = String(p.stock ?? "");
  pUnit.value = p.unit || "";

  btnDeleteProduct.classList.remove("d-none");
}

function deleteProduct() {
  if (!editingId) return;
  const p = products.find(x => x.id === editingId);
  if (!p) return;

  if (!confirm(`¿Eliminar "${p.name}"?`)) return;

  const all = getAllProducts().filter(x => !(x.id === editingId && x.bizId === ctx.biz.id));
  saveAllProducts(all);
  loadProducts();
  renderTable(searchInput?.value || "");
  resetForm();
}

function seedDemo() {
  const all = getAllProducts();
  const demo = [
    { name: "Coca 600ml", sku: "COCA-600", category: "Bebidas", unit: "pieza", price: 20, stock: 30 },
    { name: "Sabritas", sku: "SAB-45", category: "Snacks", unit: "pieza", price: 18, stock: 25 },
    { name: "Pan dulce", sku: "PAN-01", category: "Panadería", unit: "pieza", price: 12, stock: 40 }
  ];

  for (const d of demo) {
    all.push({
      id: crypto.randomUUID(),
      bizId: ctx.biz.id,
      ...d,
      trackStock: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  saveAllProducts(all);
  loadProducts();
  renderTable(searchInput?.value || "");
}

function clearAll() {
  if (!confirm("¿Borrar TODOS los productos de esta empresa?")) return;
  const all = getAllProducts().filter(p => p.bizId !== ctx.biz.id);
  saveAllProducts(all);
  loadProducts();
  renderTable("");
  resetForm();
}

// ===== Logout (con modal) =====
function wireLogout() {
  if (!btnLogoutInv) return;

  if (!logoutModal) {
    btnLogoutInv.addEventListener("click", () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) {
        clearSession();
        window.location.href = "Index.html";
      }
    });
    return;
  }

  btnLogoutInv.addEventListener("click", () => logoutModal.show());
  confirmLogoutBtn?.addEventListener("click", () => {
    clearSession();
    window.location.href = "Index.html";
  });
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  ctx = requireAuth();
  if (!ctx) return;

  if (bizMini) bizMini.textContent = `${ctx.biz.name} — @${ctx.biz.handle}`;

  loadProducts();
  renderTable("");

  searchInput?.addEventListener("input", () => renderTable(searchInput.value));
  productsTbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    if (act === "edit") loadToForm(id);
  });

  btnSaveProduct?.addEventListener("click", upsertProduct);
  btnResetForm?.addEventListener("click", resetForm);
  btnDeleteProduct?.addEventListener("click", deleteProduct);
  btnSeedDemo?.addEventListener("click", seedDemo);
  btnClearAll?.addEventListener("click", clearAll);

  wireLogout();
});
