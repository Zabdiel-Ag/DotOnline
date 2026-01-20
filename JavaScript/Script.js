// ====== Storage Keys ======
const USERS_KEY = "pos_users";
const SESSION_KEY = "pos_session";
const BUSINESSES_KEY = "pos_businesses";

// ====== Helpers ======
function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getBusinesses() {
  try { return JSON.parse(localStorage.getItem(BUSINESSES_KEY)) || []; } catch { return []; }
}
function saveBusinesses(b) {
  localStorage.setItem(BUSINESSES_KEY, JSON.stringify(b));
}
function getBusinessByOwner(userId) {
  return getBusinesses().find(x => x.ownerUserId === userId) || null;
}
function handleExists(handle) {
  return getBusinesses().some(x => (x.handle || "").toLowerCase() === handle.toLowerCase());
}

// ====== UI helpers ======
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
function showView(viewId) {
  const views = ["view-login", "view-register", "view-business"];
  views.forEach(id => document.getElementById(id)?.classList.add("d-none"));
  document.getElementById(viewId)?.classList.remove("d-none");
}

// ====== Validation ======
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
function isValidHandle(handle) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(handle.trim());
}
function normalizeHandle(handle) {
  // convierte a minúsculas y quita espacios
  return String(handle || "").trim().replace(/\s+/g, "").toLowerCase();
}
function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

// ====== DOM ======
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regError = document.getElementById("regError");

// Business
const bizName = document.getElementById("bizName");
const bizHandle = document.getElementById("bizHandle");
const bizCategory = document.getElementById("bizCategory");
const bizLogo = document.getElementById("bizLogo");
const bizLogoPreview = document.getElementById("bizLogoPreview");
const bizError = document.getElementById("bizError");
let bizLogoDataUrl = "";

// ====== Nav buttons ======
document.getElementById("goRegister")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-register");
});
document.getElementById("goLogin")?.addEventListener("click", () => {
  hideError(regError);
  showView("view-login");
});

// ====== Logo preview ======
bizLogo?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 800000) {
    showError(bizError, "Logo muy pesado. Usa una imagen menor a ~800KB.");
    if (bizLogo) bizLogo.value = "";
    bizLogoDataUrl = "";
    bizLogoPreview?.classList.add("d-none");
    return;
  }

  hideError(bizError);

  try {
    bizLogoDataUrl = await fileToDataUrl(file);
    if (bizLogoPreview) {
      bizLogoPreview.src = bizLogoDataUrl;
      bizLogoPreview.classList.remove("d-none");
    }
  } catch {
    showError(bizError, "No se pudo leer la imagen. Intenta con otra.");
  }
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ====== Flow control ======
function goToNextStep(userId) {
  const biz = getBusinessByOwner(userId);

  if (!biz) {
    // wizard
    if (bizName) bizName.value = "";
    if (bizHandle) bizHandle.value = "";
    if (bizCategory) bizCategory.value = "";
    if (bizLogo) bizLogo.value = "";
    bizLogoDataUrl = "";
    bizLogoPreview?.classList.add("d-none");
    hideError(bizError);

    showView("view-business");
    return;
  }

  // ya tiene empresa => Dashboard
  window.location.href = "Dashboard.html";
}

// ====== Register ======
document.getElementById("btnRegister")?.addEventListener("click", () => {
  hideError(regError);

  const name = (regName?.value || "").trim();
  const email = (regEmail?.value || "").trim();
  const password = regPassword?.value || "";

  if (name.length < 2) return showError(regError, "Pon tu nombre (mínimo 2 letras).");
  if (!isValidEmail(email)) return showError(regError, "Correo inválido.");
  if (password.length < 6) return showError(regError, "Contraseña mínima: 6 caracteres.");

  if (findUserByEmail(email)) return showError(regError, "Ese correo ya está registrado.");

  const users = getUsers();
  const newUser = {
    id: crypto.randomUUID(),
    name,
    email,
    password,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);

  setSession({ userId: newUser.id, email: newUser.email, loginAt: new Date().toISOString() });
  goToNextStep(newUser.id);
});

// ====== Login ======
document.getElementById("btnLogin")?.addEventListener("click", () => {
  hideError(loginError);

  const email = (loginEmail?.value || "").trim();
  const password = loginPassword?.value || "";

  if (!isValidEmail(email)) return showError(loginError, "Pon un correo válido.");
  if (!password) return showError(loginError, "Pon tu contraseña.");

  const user = findUserByEmail(email);
  if (!user) return showError(loginError, "No existe ese usuario.");
  if (user.password !== password) return showError(loginError, "Contraseña incorrecta.");

  setSession({ userId: user.id, email: user.email, loginAt: new Date().toISOString() });
  goToNextStep(user.id);
});

// ====== Create Business ======
document.getElementById("btnCreateBusiness")?.addEventListener("click", () => {
  hideError(bizError);

  const session = getSession();
  if (!session?.userId) return showError(bizError, "No hay sesión activa.");

  const name = (bizName?.value || "").trim();
  const handle = normalizeHandle(bizHandle?.value || "");
  const category = bizCategory?.value || "";

  if (name.length < 2) return showError(bizError, "Nombre de empresa inválido.");
  if (!isValidHandle(handle)) return showError(bizError, "El @usuario debe ser 3-20 y sin espacios (solo letras/números/_).");
  if (handleExists(handle)) return showError(bizError, "Ese @usuario ya está en uso.");
  if (!category) return showError(bizError, "Selecciona una categoría.");

  const all = getBusinesses();
  all.push({
    id: crypto.randomUUID(),
    ownerUserId: session.userId,
    name,
    handle,
    category,
    logoDataUrl: bizLogoDataUrl || "",
    createdAt: new Date().toISOString()
  });
  saveBusinesses(all);

  // listo => Dashboard
  window.location.href = "Dashboard.html";
});

// ====== Auto login ======
(function init() {
  const session = getSession();
  if (!session?.userId) {
    showView("view-login");
    return;
  }

  const user = getUsers().find(u => u.id === session.userId);
  if (!user) {
    clearSession();
    showView("view-login");
    return;
  }

  goToNextStep(session.userId);
})();
