// JavaScript/Inventario.js
import { supabase } from "./supabaseClient.js";

/* =========================
   THEME (igual que POS)
========================= */
const THEME_KEY = "dash_theme";

function setupTheme() {
  const btn = document.getElementById("btnTheme");
  if (!btn) return;

  const root = document.documentElement;

  function paintIcon(theme) {
    const isLight = theme === "light";
    btn.innerHTML = isLight
      ? '<i class="bi bi-moon-stars"></i>'
      : '<i class="bi bi-sun"></i>';
  }

  function applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    root.setAttribute("data-bs-theme", t);
    document.body.classList.toggle("theme-light", t === "light");
    localStorage.setItem(THEME_KEY, t);
    paintIcon(t);
  }

  const current = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  applyTheme(current); // ✅ aplica + pinta icon al cargar

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const now = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    applyTheme(now === "light" ? "dark" : "light");
  });
}

/* =========================
   UUID fallback
========================= */
function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  // fallback simple
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* =========================
   KEYS (Conectado con POS)
========================= */
const SESSION_KEY = "pos_session";
const USERS_KEY = "pos_users";
const BUSINESSES_KEY = "pos_businesses";
const PRODUCTS_KEY = "pos_products_v1";

/* =========================
   Storage utils (local)
========================= */
function jget(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function jset(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getSession() {
  return jget(SESSION_KEY, null);
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function getUsers() {
  return jget(USERS_KEY, []);
}
function getBusinessesLocal() {
  return jget(BUSINESSES_KEY, []);
}
function getBusinessByOwnerLocal(userId) {
  return getBusinessesLocal().find((b) => b.ownerUserId === userId) || null;
}

/* =========================
   Auth: Supabase first, local fallback
========================= */
async function getMyFirstBusinessSB() {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, handle, category, owner_id, logo_url, currency, timezone, created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function requireAuthOrRedirect() {
  // 1) Supabase
  try {
    const { data, error } = await supabase.auth.getUser();
    const sbUser = data?.user;

    if (sbUser && !error) {
      let biz = null;
      try {
        biz = await getMyFirstBusinessSB();
      } catch (e) {
        console.error("getMyFirstBusinessSB:", e);
      }

      const localMatch = getUsers().find(
        (u) => (u.email || "").toLowerCase() === (sbUser.email || "").toLowerCase()
      );

      return {
        user: {
          id: sbUser.id,
          email: sbUser.email,
          name:
            sbUser.user_metadata?.full_name ||
            sbUser.user_metadata?.name ||
            localMatch?.name ||
            localMatch?.fullName ||
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

  // 2) Local fallback
  const s = getSession();
  if (!s?.userId) {
    window.location.href = "Index.html";
    return null;
  }

  const u = getUsers().find((x) => x.id === s.userId);
  if (!u) {
    clearSession();
    window.location.href = "Index.html";
    return null;
  }

  const biz = getBusinessByOwnerLocal(s.userId);
  if (!biz) {
    window.location.href = "Index.html";
    return null;
  }

  return { user: u, biz, auth: "local" };
}

/* =========================
   Products local schema (igual POS)
========================= */
function normalizeProductLocal(p) {
  if (!p) return p;
  if (!p.bizId && p.businessId) p.bizId = p.businessId;
  if (p.imageUrl && !p.image_url) p.image_url = p.imageUrl;
  if (p.imagePath && !p.image_path) p.image_path = p.imagePath;
  return p;
}
function getAllProductsLocal() {
  return jget(PRODUCTS_KEY, []).map(normalizeProductLocal);
}
function saveAllProductsLocal(all) {
  jset(PRODUCTS_KEY, all);
}
function getProductsByBizLocal(bizId) {
  return getAllProductsLocal().filter((p) => p.bizId === bizId);
}

/* =========================
   Supabase PRODUCTS (CRUD)
========================= */
function extractCategoryFromDescription(desc) {
  const s = String(desc || "").trim();
  const m = s.match(/^Categor[ií]a:\s*(.+)$/i);
  return m ? (m[1] || "").trim() : "";
}
function buildDescriptionFromCategory(category) {
  const c = String(category || "").trim();
  return c ? `Categoría: ${c}` : null;
}
function mapRowToProduct(row) {
  return {
    id: row.id,
    bizId: row.business_id,
    name: row.name || "",
    sku: row.sku || "",
    barcode: row.barcode || "",
    category: extractCategoryFromDescription(row.description),
    unit: row.unit || "pz",
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    trackStock: true,
    image_url: row.image_url || "",
    image_path: "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
function mapProductToRow(p, businessId) {
  return {
    business_id: businessId,
    sku: p.sku || null,
    barcode: p.barcode || null,
    name: p.name,
    description: buildDescriptionFromCategory(p.category),
    unit: p.unit || "pz",
    price: Number(p.price || 0),
    stock: Number(p.stock || 0),
    is_active: true,
    image_url: p.image_url || null,
  };
}

async function fetchProductsSB(businessId) {
  const { data, error } = await supabase
    .from("products")
    .select("id, business_id, sku, barcode, name, description, unit, price, stock, image_url, created_at, updated_at")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToProduct);
}
async function insertProductSB(businessId, product) {
  const row = mapProductToRow(product, businessId);
  row.id = product.id;

  const { data, error } = await supabase.from("products").insert(row).select().single();
  if (error) throw error;
  return mapRowToProduct(data);
}
async function updateProductSB(businessId, product) {
  const row = mapProductToRow(product, businessId);

  const { data, error } = await supabase
    .from("products")
    .update(row)
    .eq("id", product.id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) throw error;
  return mapRowToProduct(data);
}
async function deleteProductSB(businessId, id) {
  const { error } = await supabase.from("products").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
async function clearAllProductsSB(businessId) {
  const { error } = await supabase.from("products").delete().eq("business_id", businessId);
  if (error) throw error;
}
async function seedDemoSB(businessId) {
  const demo = [
    { id: uuid(), name: "Coca 600ml", sku: "COCA-600", barcode: "7501055300102", category: "Bebidas", unit: "pieza", price: 20, stock: 30 },
    { id: uuid(), name: "Sabritas", sku: "SAB-45", barcode: "7501011111111", category: "Snacks", unit: "pieza", price: 18, stock: 25 },
    { id: uuid(), name: "Pan dulce", sku: "PAN-01", barcode: "", category: "Panadería", unit: "pieza", price: 12, stock: 40 },
  ];

  const rows = demo.map((p) => {
    const r = mapProductToRow({ ...p, image_url: "" }, businessId);
    r.id = p.id;
    return r;
  });

  const { error } = await supabase.from("products").insert(rows);
  if (error) throw error;
}

/* =========================
   Supabase STORAGE (Images)
========================= */
const STORAGE_BUCKET = "Multimedia";
const MAX_IMG_MB = 3;
const ALLOWED_IMG = new Set(["image/png", "image/jpeg", "image/webp"]);

async function uploadProductImageSB({ businessId, productId, file }) {
  if (!file) return "";

  if (!ALLOWED_IMG.has(file.type)) throw new Error("Formato no permitido. Usa PNG/JPG/WebP.");
  if (file.size > MAX_IMG_MB * 1024 * 1024) throw new Error("Imagen muy pesada. Máx 3MB.");

  const ext =
    file.type === "image/png" ? "png" :
    file.type === "image/webp" ? "webp" : "jpg";

  const path = `businesses/${businessId}/products/${productId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "";
}

/* =========================
   DOM
========================= */
const bizMini = document.getElementById("bizMini");
const searchInput = document.getElementById("searchInput");
const productsTbody = document.getElementById("productsTbody");
const countLabel = document.getElementById("countLabel");
const emptyState = document.getElementById("emptyState");

const brandNameText = document.getElementById("brandNameText");
const brandLogoImg = document.getElementById("brandLogoImg");

const formError = document.getElementById("formError");
const formTitle = document.getElementById("formTitle");

const pName = document.getElementById("pName");
const pSku = document.getElementById("pSku");
const pBarcode = document.getElementById("pBarcode");
const pCategory = document.getElementById("pCategory");
const pPrice = document.getElementById("pPrice");
const pStock = document.getElementById("pStock");
const pUnit = document.getElementById("pUnit");

const btnGenSku = document.getElementById("btnGenSku");
const btnScanBarcode = document.getElementById("btnScanBarcode");

const pImage = document.getElementById("pImage");
const pImagePreview = document.getElementById("pImagePreview");
const btnRemoveImage = document.getElementById("btnRemoveImage");

const btnSaveProduct = document.getElementById("btnSaveProduct");
const btnDeleteProduct = document.getElementById("btnDeleteProduct");
const btnResetForm = document.getElementById("btnResetForm");
const btnSeedDemo = document.getElementById("btnSeedDemo");
const btnClearAll = document.getElementById("btnClearAll");

// Logout modal
const logoutModalEl = document.getElementById("logoutModalDash");
const confirmLogoutBtn = document.getElementById("confirmLogoutDash");
const logoutModal = logoutModalEl && window.bootstrap?.Modal
  ? bootstrap.Modal.getOrCreateInstance(logoutModalEl)
  : null;

/* =========================
   State
========================= */
let ctx = null;
let products = [];
let editingId = null;

let editingImageUrl = "";
let editingImagePath = "";

let skuTouched = false;

/* =========================
   Utils UI
========================= */
function money(n) {
  const c = ctx?.biz?.currency || "MXN";
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: c });
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

/* =========================
   SKU generator (mejorado)
========================= */
function sanitizeSkuPart(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, "A")
    .replace(/[ÉÈËÊ]/g, "E")
    .replace(/[ÍÌÏÎ]/g, "I")
    .replace(/[ÓÒÖÔ]/g, "O")
    .replace(/[ÚÙÜÛ]/g, "U")
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function randomBase36(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}
function skuExistsInBiz(sku) {
  const s = String(sku || "").trim().toLowerCase();
  return products.some((p) => (p.sku || "").trim().toLowerCase() === s);
}
function generateSkuFromName(name) {
  const base = sanitizeSkuPart(name).slice(0, 16) || "PROD";
  return `${base}-${randomBase36(4)}`;
}
function generateUniqueSku(name) {
  let sku = generateSkuFromName(name);
  let tries = 0;
  while (skuExistsInBiz(sku) && tries < 25) {
    sku = generateSkuFromName(name);
    tries++;
  }
  return sku;
}
function setSkuValue(nextSku) {
  if (!pSku) return;
  pSku.value = nextSku || "";
}

function wireSkuAuto() {
  if (!pName || !pSku) return;

  skuTouched = false;

  pSku.addEventListener("input", () => {
    skuTouched = true;
  });

  pName.addEventListener("input", () => {
    if (skuTouched) return;
    const n = (pName.value || "").trim();
    if (!n) return setSkuValue("");
    setSkuValue(generateUniqueSku(n));
  });

  btnGenSku?.addEventListener("click", () => {
    const n = (pName?.value || "").trim();
    setSkuValue(generateUniqueSku(n));
  });

  const initName = (pName.value || "").trim();
  const initSku = (pSku.value || "").trim();
  if (initName && !initSku) setSkuValue(generateUniqueSku(initName));
}

/* =========================
   Image preview
========================= */
function setPreview(url) {
  editingImageUrl = url || "";
  if (!pImagePreview) return;

  if (editingImageUrl) {
    pImagePreview.src = editingImageUrl;
    pImagePreview.style.display = "block";
  } else {
    pImagePreview.removeAttribute("src");
    pImagePreview.style.display = "none";
  }
}
function wireImagePreview() {
  if (!pImage) return;

  pImage.addEventListener("change", () => {
    const file = pImage.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  });

  btnRemoveImage?.addEventListener("click", () => {
    if (pImage) pImage.value = "";
    setPreview("");
    editingImageUrl = "";
    editingImagePath = "";
  });
}

/* =========================
   Brand header
========================= */
function renderBrandHeader() {
  const name = (ctx?.biz?.name || "DotLine").trim();
  const logo = (ctx?.biz?.logo_url || "").trim();

  if (brandNameText) brandNameText.textContent = name;

  if (brandLogoImg) {
    if (logo) {
      brandLogoImg.src = logo;
      brandLogoImg.classList.remove("d-none");
    } else {
      brandLogoImg.classList.add("d-none");
      brandLogoImg.removeAttribute("src");
    }
  }

  if (bizMini) {
    const handle = (ctx?.biz?.handle || "").trim();
    bizMini.textContent = handle ? `${name} — @${handle}` : name;
  }
}

/* =========================
   Load Products
========================= */
async function loadProducts() {
  if (!ctx?.biz?.id) {
    products = [];
    return;
  }

  if (ctx.auth === "supabase") {
    try {
      products = await fetchProductsSB(ctx.biz.id);
      return;
    } catch (e) {
      console.error("fetchProductsSB error:", e);
      products = getProductsByBizLocal(ctx.biz.id);
      showError("No pude cargar desde Supabase. Mostrando datos locales. Revisa RLS/políticas.");
      return;
    }
  }

  products = getProductsByBizLocal(ctx.biz.id);
}

/* =========================
   Render Table
========================= */
function renderTable(filter = "") {
  const q = (filter || "").trim().toLowerCase();

  const list = products
    .filter((p) =>
      !q ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.barcode || "").toLowerCase().includes(q)
    )
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (countLabel) countLabel.textContent = `${list.length} productos`;
  if (emptyState) emptyState.classList.toggle("d-none", list.length !== 0);

  if (!productsTbody) return;

  productsTbody.innerHTML = list
    .map(
      (p) => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          ${p.image_url ? `<img class="inv-thumb" src="${escapeHtml(p.image_url)}" alt="img">` : ``}
          <div>
            <div class="fw-semibold">${escapeHtml(p.name)}</div>
            <div class="text-secondary small">${escapeHtml(p.unit || "pz")}</div>
            ${p.barcode ? `<div class="text-secondary small">📌 ${escapeHtml(p.barcode)}</div>` : ``}
          </div>
        </div>
      </td>
      <td class="text-secondary">${escapeHtml(p.sku || "—")}</td>
      <td class="text-secondary">${escapeHtml(p.category || "—")}</td>
      <td class="text-end">${money(p.price)}</td>
      <td class="text-end">${Number(p.stock || 0)}</td>
      <td class="text-end">
        <button class="btn btn-outline-light btn-sm" data-act="edit" data-id="${p.id}">Editar</button>
      </td>
    </tr>
  `
    )
    .join("");
}

/* =========================
   UI form
========================= */
function resetForm() {
  editingId = null;
  hideError();
  skuTouched = false;

  if (formTitle) formTitle.textContent = "Agregar producto";

  if (pName) pName.value = "";
  if (pSku) pSku.value = "";
  if (pBarcode) pBarcode.value = "";
  if (pCategory) pCategory.value = "";
  if (pPrice) pPrice.value = "";
  if (pStock) pStock.value = "";
  if (pUnit) pUnit.value = "";

  if (pImage) pImage.value = "";
  setPreview("");

  editingImageUrl = "";
  editingImagePath = "";

  btnDeleteProduct?.classList.add("d-none");
}

/* =========================
   CRUD helpers
========================= */
function readForm() {
  const name = (pName?.value || "").trim();
  const sku = (pSku?.value || "").trim();
  const barcode = (pBarcode?.value || "").trim();
  const category = (pCategory?.value || "").trim();
  const unit = (pUnit?.value || "").trim() || "pz";
  const price = Number(pPrice?.value || 0);
  const stock = Number(pStock?.value || 0);

  if (name.length < 2) return { ok: false, msg: "Nombre inválido." };
  if (!Number.isFinite(price) || price < 0) return { ok: false, msg: "Precio inválido." };
  if (!Number.isFinite(stock) || stock < 0) return { ok: false, msg: "Stock inválido." };

  let finalSku = sku;
  if (!finalSku) finalSku = generateUniqueSku(name);

  return {
    ok: true,
    product: {
      id: editingId || uuid(),
      bizId: ctx.biz.id,
      name,
      sku: finalSku,
      barcode,
      category,
      unit,
      price,
      stock,
      trackStock: true,
      image_url: editingImageUrl || "",
      image_path: editingImagePath || "",
      createdAt: editingId ? null : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

async function upsertProduct() {
  hideError();
  if (!ctx?.biz?.id) return showError("No se encontró tu empresa.");

  const r = readForm();
  if (!r.ok) return showError(r.msg);

  const p = r.product;
  const file = pImage?.files?.[0] || null;

  if (ctx.auth === "supabase") {
    try {
      if (file) {
        const url = await uploadProductImageSB({
          businessId: ctx.biz.id,
          productId: p.id,
          file,
        });
        p.image_url = url || p.image_url || "";
      }

      if (!editingId) await insertProductSB(ctx.biz.id, p);
      else await updateProductSB(ctx.biz.id, p);

      await loadProducts();
      renderTable(searchInput?.value || "");
      resetForm();
      return;
    } catch (e) {
      console.error("upsert supabase error:", e);
      return showError("No pude guardar en Supabase. Revisa RLS/políticas y columnas (sku/barcode).");
    }
  }

  const all = getAllProductsLocal();

  if (!editingId) {
    all.push({
      id: p.id,
      bizId: ctx.biz.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || "",
      category: p.category || "",
      unit: p.unit,
      price: p.price,
      stock: p.stock,
      trackStock: true,
      image_url: p.image_url || "",
      image_path: p.image_path || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else {
    const idx = all.findIndex((x) => x.id === editingId && (x.bizId === ctx.biz.id || x.businessId === ctx.biz.id));
    if (idx === -1) return showError("No encontré ese producto para editar.");

    const prev = normalizeProductLocal(all[idx]);
    all[idx] = {
      ...prev,
      bizId: ctx.biz.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || "",
      category: p.category || "",
      unit: p.unit,
      price: p.price,
      stock: p.stock,
      trackStock: prev.trackStock ?? true,
      image_url: p.image_url || prev.image_url || "",
      image_path: p.image_path || prev.image_path || "",
      updatedAt: new Date().toISOString(),
    };
  }

  saveAllProductsLocal(all);

  await loadProducts();
  renderTable(searchInput?.value || "");
  resetForm();
}

function loadToForm(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;

  editingId = id;
  skuTouched = true;
  hideError();

  if (formTitle) formTitle.textContent = "Editar producto";

  if (pName) pName.value = p.name || "";
  if (pSku) pSku.value = p.sku || "";
  if (pBarcode) pBarcode.value = p.barcode || "";
  if (pCategory) pCategory.value = p.category || "";
  if (pPrice) pPrice.value = String(p.price ?? "");
  if (pStock) pStock.value = String(p.stock ?? "");
  if (pUnit) pUnit.value = p.unit || "pz";

  editingImageUrl = p.image_url || "";
  editingImagePath = p.image_path || "";
  setPreview(editingImageUrl);

  if (pImage) pImage.value = "";

  btnDeleteProduct?.classList.remove("d-none");
}

async function deleteProduct() {
  if (!editingId) return;

  const p = products.find((x) => x.id === editingId);
  if (!p) return;

  if (!confirm(`¿Eliminar "${p.name}"?`)) return;

  if (ctx.auth === "supabase") {
    try {
      await deleteProductSB(ctx.biz.id, editingId);
      await loadProducts();
      renderTable(searchInput?.value || "");
      resetForm();
      return;
    } catch (e) {
      console.error("deleteProductSB error:", e);
      return showError("No pude eliminar en Supabase. Revisa RLS/políticas.");
    }
  }

  const all = getAllProductsLocal().filter((x) => !(x.id === editingId && x.bizId === ctx.biz.id));
  saveAllProductsLocal(all);

  await loadProducts();
  renderTable(searchInput?.value || "");
  resetForm();
}

async function seedDemo() {
  hideError();
  if (!ctx?.biz?.id) return;

  if (ctx.auth === "supabase") {
    try {
      await seedDemoSB(ctx.biz.id);
      await loadProducts();
      renderTable(searchInput?.value || "");
      return;
    } catch (e) {
      console.error("seedDemoSB error:", e);
      return showError("No pude cargar demo en Supabase. Revisa tabla/políticas.");
    }
  }

  const all = getAllProductsLocal();
  const demo = [
    { name: "Coca 600ml", sku: "COCA-600", barcode: "7501055300102", category: "Bebidas", unit: "pieza", price: 20, stock: 30 },
    { name: "Sabritas", sku: "SAB-45", barcode: "7501011111111", category: "Snacks", unit: "pieza", price: 18, stock: 25 },
    { name: "Pan dulce", sku: "PAN-01", barcode: "", category: "Panadería", unit: "pieza", price: 12, stock: 40 },
  ];

  for (const d of demo) {
    all.push({
      id: uuid(),
      bizId: ctx.biz.id,
      ...d,
      trackStock: true,
      image_url: "",
      image_path: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveAllProductsLocal(all);
  await loadProducts();
  renderTable(searchInput?.value || "");
}

async function clearAll() {
  hideError();
  if (!ctx?.biz?.id) return;
  if (!confirm("¿Borrar TODOS los productos de esta empresa?")) return;

  if (ctx.auth === "supabase") {
    try {
      await clearAllProductsSB(ctx.biz.id);
      await loadProducts();
      renderTable("");
      resetForm();
      return;
    } catch (e) {
      console.error("clearAllProductsSB error:", e);
      return showError("No pude borrar todo en Supabase. Revisa RLS/políticas.");
    }
  }

  const all = getAllProductsLocal().filter((p) => p.bizId !== ctx.biz.id);
  saveAllProductsLocal(all);

  await loadProducts();
  renderTable("");
  resetForm();
}

/* =========================
   Logout
========================= */
function wireLogout() {
  const doLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    clearSession();
    window.location.href = "Index.html";
  };

  confirmLogoutBtn?.addEventListener("click", async () => {
    await doLogout();
    try {
      logoutModal?.hide();
    } catch {}
  });
}

/* =========================
   ✅ Barcode Scan (HTML5 camera)
========================= */
const BARCODE_CDN = "https://unpkg.com/html5-qrcode@2.3.10/html5-qrcode.min.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) return resolve();
    const existing = [...document.scripts].some((s) => s.src && s.src.includes(src));
    if (existing) return resolve();

    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No pude cargar la librería de escaneo."));
    document.head.appendChild(s);
  });
}

function showScanError(msg) {
  const el = document.getElementById("scanErr");
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}
function hideScanError() {
  const el = document.getElementById("scanErr");
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}

let scanner = null;

async function startBarcodeScanner() {
  const modalEl = document.getElementById("scanModal");
  const readerId = "scanReader";
  if (!modalEl) return showError("Falta el modal #scanModal en tu HTML.");
  if (!pBarcode) return showError("Falta el input #pBarcode en tu HTML.");

  hideScanError();

  try {
    await loadScriptOnce(BARCODE_CDN);
  } catch (e) {
    console.error(e);
    return showScanError("No pude cargar el escáner (revisa internet o CSP).");
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  modalEl.addEventListener(
    "shown.bs.modal",
    async () => {
      try {
        const reader = document.getElementById(readerId);
        if (reader) reader.innerHTML = "";

        scanner = new Html5Qrcode(readerId);

        const config = {
          fps: 12,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.777,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            const val = String(decodedText || "").trim();
            if (!val) return;

            pBarcode.value = val;
            pBarcode.dispatchEvent(new Event("input", { bubbles: true }));

            if (pSku && !(pSku.value || "").trim()) {
              pSku.value = val;
              skuTouched = true;
            }

            try {
              bootstrap.Modal.getInstance(modalEl)?.hide();
            } catch {}
          },
          () => {}
        );
      } catch (e) {
        console.error("scanner start error:", e);
        showScanError("No pude iniciar la cámara. Activa permisos y usa HTTPS.");
      }
    },
    { once: true }
  );

  modalEl.addEventListener(
    "hidden.bs.modal",
    async () => {
      try {
        if (scanner) {
          await scanner.stop();
          await scanner.clear();
        }
      } catch {}
      scanner = null;

      const reader = document.getElementById(readerId);
      if (reader) reader.innerHTML = "";
    },
    { once: true }
  );
}

function wireBarcodeScanner() {
  if (!btnScanBarcode) return;
  btnScanBarcode.addEventListener("click", async () => {
    await startBarcodeScanner();
  });
}

/* =========================
   Sync con POS (mismo localStorage)
========================= */
function wireProductsSyncWithPOS() {
  window.addEventListener("storage", async (e) => {
    if (e.key !== PRODUCTS_KEY) return;
    if (!ctx?.biz?.id) return;

    if (ctx.auth !== "supabase") {
      products = getProductsByBizLocal(ctx.biz.id);
      renderTable(searchInput?.value || "");
      return;
    }

    await loadProducts();
    renderTable(searchInput?.value || "");
  });
}

/* =========================
   Init ✅ (CORREGIDO)
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  // ✅ antes tronaba por setupThemeBtn() (no existía)
  try {
    setupTheme();
  } catch (e) {
    console.error("Theme init error:", e);
  }

  ctx = await requireAuthOrRedirect();
  if (!ctx) return;

  if (ctx.auth === "supabase" && !ctx.biz?.id) {
    try {
      ctx.biz = await getMyFirstBusinessSB();
    } catch {}
  }

  if (!ctx?.biz?.id) {
    showError("No encontré tu negocio. Crea un registro en businesses o revisa políticas.");
    return;
  }

  renderBrandHeader();

  wireSkuAuto();
  wireBarcodeScanner();
  wireImagePreview();
  wireLogout();
  wireProductsSyncWithPOS();

  await loadProducts();
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
});
