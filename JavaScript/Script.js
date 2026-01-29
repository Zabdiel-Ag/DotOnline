import { supabase } from "./supabaseClient.js";

/* =========================
   DOM
========================= */
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regError = document.getElementById("regError");

const btnRoleOwner = document.getElementById("btnRoleOwner");
const btnRoleEmployee = document.getElementById("btnRoleEmployee");
const roleHint = document.getElementById("roleHint");

const empInviteCode = document.getElementById("empInviteCode");
const empJoinError = document.getElementById("empJoinError");
const btnJoinByCode = document.getElementById("btnJoinByCode");
const btnBackToRole = document.getElementById("btnBackToRole");

const bizName = document.getElementById("bizName");
const bizHandle = document.getElementById("bizHandle");
const bizCategory = document.getElementById("bizCategory");
const bizLogo = document.getElementById("bizLogo");
const bizLogoPreview = document.getElementById("bizLogoPreview");
const bizError = document.getElementById("bizError");

const loginBottomCard = document.getElementById("loginBottomCard");
const leftPanel = document.querySelector(".auth-left");
const grid = document.querySelector(".auth-grid");

let bizLogoDataUrl = "";

/* =========================
   Config de rutas
========================= */
const ROUTES = {
  dashboard: "Dashboard.html",
  admin: "Admin.html",
};

/* =========================
   UI helpers
========================= */
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}
function hideError(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}

function setLeftVisible(isVisible) {
  if (!leftPanel) return;
  leftPanel.classList.toggle("d-none", !isVisible);
  // si estaba pensado para desktop
  if (isVisible) leftPanel.classList.add("d-lg-flex");
}

function setGridBusinessOnly(isBusinessOnly) {
  if (!grid) return;
  grid.classList.toggle("auth-grid-business-only", !!isBusinessOnly);
}

/** Vista normal (login/register/join/business) */
function setCenteredLayout(isCentered) {
  const grid = document.querySelector(".auth-grid");
  if (!grid) return;

  grid.classList.toggle("is-centered", isCentered);

  // Si existe la imagen izquierda, también la apagamos/encendemos
  const left = document.querySelector(".auth-left");
  if (left) {
    // si está centrado => ocultar
    left.classList.toggle("d-none", isCentered);
    // si NO está centrado => que vuelva en desktop
    if (!isCentered) left.classList.add("d-none", "d-lg-flex");
  }
}

function showView(viewId) {
  const views = ["view-login", "view-register", "view-business", "view-employee-join"];
  views.forEach((id) => document.getElementById(id)?.classList.add("d-none"));
  document.getElementById(viewId)?.classList.remove("d-none");

  const centered = (viewId !== "view-login");
  setCenteredLayout(centered);

  // Card “¿No tienes cuenta? Regístrate”
  if (loginBottomCard) {
    loginBottomCard.classList.toggle("d-none", viewId !== "view-login");
  }

  // Limpia errores
  hideError(loginError);
  hideError(regError);
  hideError(empJoinError);
  hideError(bizError);
}

/** Modo: SOLO crear empresa (sin imagen, sin regístrate, sin login) */
function showBusinessOnly() {
  document.getElementById("view-login")?.classList.add("d-none");
  document.getElementById("view-register")?.classList.add("d-none");
  document.getElementById("view-employee-join")?.classList.add("d-none");
  document.getElementById("loginBottomCard")?.classList.add("d-none");

  document.getElementById("view-business")?.classList.remove("d-none");

  setLeftVisible(false);
  setGridBusinessOnly(true);

  hideError(loginError);
  hideError(regError);
  hideError(empJoinError);
  hideError(bizError);
}

/* =========================
   Validation
========================= */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function normalizeHandle(handle) {
  return String(handle || "").trim().replace(/\s+/g, "").toLowerCase();
}
function isValidHandle(handle) {
  return /^[a-z0-9_]{3,20}$/.test(String(handle || "").trim());
}
function normalizeInviteCode(code) {
  return String(code || "").trim().replace(/\s+/g, "").toUpperCase();
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* =========================
   Role state (UI)
========================= */
const ROLE_KEY = "pos_role_pick";
let pickedRole = localStorage.getItem(ROLE_KEY) || "owner";

function paintRole() {
  const isOwner = pickedRole === "owner";

  btnRoleOwner?.classList.toggle("btn-primary", isOwner);
  btnRoleOwner?.classList.toggle("btn-soft", !isOwner);

  btnRoleEmployee?.classList.toggle("btn-primary", !isOwner);
  btnRoleEmployee?.classList.toggle("btn-soft", isOwner);

  if (roleHint) {
    roleHint.textContent = isOwner
      ? "Propetario: podrás crear tu empresa y administrar."
      : "Empleado: te unirás con un código/QR que se te asigno";
  }

  localStorage.setItem(ROLE_KEY, pickedRole);
}

/* =========================
   Supabase helpers
========================= */
async function ensureProfile(user, fullName = "", role = "") {
  if (!user?.id) return;

  const full_name =
    fullName?.trim() ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "Usuario";

  const finalRole = role || user?.user_metadata?.role || "owner";

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name, role: finalRole }, { onConflict: "id" });

  if (error) throw error;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getBusinessByOwner(ownerId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, handle, category, owner_id")
    .eq("owner_id", ownerId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function handleExistsGlobal(handle) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("handle", handle)
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
}

async function createBusinessForOwner({ ownerId, name, handle, category }) {
  console.log("si respondo")
  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .insert({ owner_id: ownerId, name, handle, category })
    .select("id, name, handle, category")
    .single();

  if (bizErr) throw bizErr;
  console.log("no jalo")
  return biz;

}



/* =========================
   Routing (anti-loop)
========================= */
let routing = false;

async function routeAfterAuth() {
  if (routing) return;
  routing = true;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      showView("view-login");
      return;
    }

    // intenta asegurar profile (si falla por RLS no truena)
    try { await ensureProfile(user, "", ""); } catch {}

    let prof = null;
    try { prof = await getProfile(user.id); } catch {}

    const role = (prof?.role || user.user_metadata?.role || pickedRole || "owner").toLowerCase();

    // admin
    if (role === "admin") {
      window.location.href = ROUTES.admin;
      return;
    }

    // employee (placeholder)
    if (role === "employee") {
      showView("view-employee-join");
      return;
    }

    // owner => si no hay business => SOLO crear empresa
    const biz = await getBusinessByOwner(user.id);
    if (!biz) {
      // limpia wizard
      if (bizName) bizName.value = "";
      if (bizHandle) bizHandle.value = "";
      if (bizCategory) bizCategory.value = "";
      if (bizLogo) bizLogo.value = "";
      bizLogoDataUrl = "";
      bizLogoPreview?.classList.add("d-none");
      hideError(bizError);

      showBusinessOnly(); 
      return;
    }

    // ya tiene empresa => dashboard
    window.location.href = ROUTES.dashboard;

  } finally {
    routing = false;
  }
}

/* =========================
   Events (role)
========================= */
paintRole();
btnRoleOwner?.addEventListener("click", () => { pickedRole = "owner"; paintRole(); });
btnRoleEmployee?.addEventListener("click", () => { pickedRole = "employee"; paintRole(); });

document.getElementById("goRegister")?.addEventListener("click", () => showView("view-register"));
document.getElementById("goRegister2")?.addEventListener("click", () => showView("view-register"));
document.getElementById("goLogin")?.addEventListener("click", () => showView("view-login"));

/* =========================
   Logo preview
========================= */
bizLogo?.addEventListener("change", async (e) => {
  hideError(bizError);

  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 800000) {
    showError(bizError, "Logo muy pesado. Usa una imagen menor a ~800KB.");
    bizLogo.value = "";
    bizLogoDataUrl = "";
    bizLogoPreview?.classList.add("d-none");
    return;
  }

  try {
    bizLogoDataUrl = await fileToDataUrl(file);
    if (bizLogoPreview) {
      bizLogoPreview.src = bizLogoDataUrl;
      bizLogoPreview.classList.remove("d-none");
    }
  } catch {
    showError(bizError, "No se pudo leer la imagen.");
  }
});

/* =========================
   Register
========================= */
document.getElementById("btnRegister")?.addEventListener("click", async () => {
  hideError(regError);

  const fullName = (regName?.value || "").trim();
  const email = (regEmail?.value || "").trim();
  const password = regPassword?.value || "";

  if (fullName.length < 2) return showError(regError, "Pon tu nombre (mínimo 2 letras).");
  if (!isValidEmail(email)) return showError(regError, "Correo inválido.");
  if (password.length < 6) return showError(regError, "Contraseña mínima: 6 caracteres.");

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: pickedRole } },
    });
    if (error) throw error;

    if (data?.user) {
      try { await ensureProfile(data.user, fullName, pickedRole); } catch {}
    }

    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      showError(regError, "Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.");
      return;
    }

    await routeAfterAuth();
  } catch (e) {
    showError(regError, e?.message || "No se pudo registrar.");
  }
});

/* =========================
   Login
========================= */
document.getElementById("btnLogin")?.addEventListener("click", async () => {
  hideError(loginError);

  const email = (loginEmail?.value || "").trim();
  const password = loginPassword?.value || "";

  if (!isValidEmail(email)) return showError(loginError, "Pon un correo válido.");
  if (!password) return showError(loginError, "Pon tu contraseña.");

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await routeAfterAuth();
  } catch (e) {
    showError(loginError, e?.message || "No se pudo iniciar sesión.");
  }
});

/* =========================
   Employee join (placeholder)
========================= */
btnBackToRole?.addEventListener("click", () => showView("view-register"));

btnJoinByCode?.addEventListener("click", async () => {
  hideError(empJoinError);
  const code = normalizeInviteCode(empInviteCode?.value || "");
  if (!code) return showError(empJoinError, "Pega o escanea un código.");

  showError(empJoinError, "Aún falta crear staff_invites en SQL.");
});

/* =========================
   Create Business (owner)
========================= */
document.getElementById("btnCreateBusiness")?.addEventListener("click", async () => {
  hideError(bizError);

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return showError(bizError, "No hay sesión activa.");

  const name = (bizName?.value || "").trim();
  const handle = normalizeHandle(bizHandle?.value || "");
  const category = bizCategory?.value || "";

  if (name.length < 2) return showError(bizError, "Nombre de empresa inválido.");
  if (!isValidHandle(handle)) return showError(bizError, "El @usuario debe ser 3-20 (a-z, 0-9, _), sin espacios.");
  if (!category) return showError(bizError, "Selecciona una categoría.");

  try {
    const exists = await handleExistsGlobal(handle);
    if (exists) return showError(bizError, "Ese @usuario ya está en uso.");

    await createBusinessForOwner({ ownerId: user.id, name, handle, category });

    window.location.href = ROUTES.dashboard;
  } catch (e) {
    showError(bizError, e?.message || "No se pudo crear la empresa.");
  }
});

/* =========================
   Init
========================= */
async function init() {
  showView("view-login");
  await routeAfterAuth();

  supabase.auth.onAuthStateChange(async () => {
    await routeAfterAuth();
  });
}

init();
