import { supabase } from "./supabaseClient.js";

const USERS_KEY = "pos_users";
const SESSION_KEY = "pos_session";
const BUSINESSES_KEY = "pos_businesses";
const THEME_KEY = "dash_theme";

/* =========================
   THEME BOOT (NO FLASH)
========================= */
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

/* =========================
   Storage utils
========================= */
function safeJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function getUsers() { return safeJSON(USERS_KEY, []); }
function getSession() { return safeJSON(SESSION_KEY, null); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getBusinessesLocal() { return safeJSON(BUSINESSES_KEY, []); }
function getBusinessByOwnerLocal(userId) {
  return getBusinessesLocal().find(b => b.ownerUserId === userId) || null;
}

/* =========================
   Supabase: Business + Logo
========================= */
async function getBusinessByOwnerSB(ownerId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, handle, category, owner_id, logo_url")
    .eq("owner_id", ownerId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
function getPublicLogoUrlFromBiz(biz) {
  return biz?.logo_url || "";
}

/* =========================
   UI helpers
========================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}
function fmtMoney(n) {
  const x = Number(n || 0);
  try {
    return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  } catch {
    return "$" + x.toFixed(2);
  }
}
function firstName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts[0] || "Usuario";
}
function pickUserDisplayName(user) {
  const name =
    user?.name ||
    user?.fullName ||
    user?.username ||
    user?.displayName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    "";
  return String(name || "").trim() || "Usuario";
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Branding
========================= */
function renderBrand(biz) {
  const img = document.getElementById("brandLogoImg");
  const nameEl = document.getElementById("brandNameText");

  const logo = getPublicLogoUrlFromBiz(biz);
  const hasLogo = !!String(logo || "").trim();

  if (img) {
    img.style.width = "30px";
    img.style.height = "30px";
    img.style.borderRadius = "10px";
    img.style.objectFit = "cover";
    img.style.objectPosition = "center";
    img.style.display = "block";
    img.style.flex = "0 0 auto";
    img.style.border = "1px solid rgba(255,255,255,.12)";
    img.loading = "eager";
    img.decoding = "async";

    if (hasLogo) {
      const finalUrl = logo.includes("?") ? logo : `${logo}?v=${Date.now()}`;
      img.src = finalUrl;
      img.alt = biz?.name ? `Logo ${biz.name}` : "Logo del negocio";
      img.classList.remove("d-none");
    } else {
      img.removeAttribute("src");
      img.classList.add("d-none");
    }
  }

  if (nameEl) {
    if (hasLogo) {
      nameEl.textContent = "";
      nameEl.classList.add("d-none");
    } else {
      nameEl.textContent = biz?.name || "MI POS";
      nameEl.classList.remove("d-none");
    }
  }
}

/* =========================
   Alerts UI (para errores RLS)
========================= */
function setAlert(msg) {
  const el = document.getElementById("alertsList");
  if (!el) return;
  el.innerHTML = `
    <div class="alert alert-warning py-2 mb-0">
      <b>Atención:</b> ${escapeHtml(msg)}
    </div>
  `;
}
function clearAlert() {
  const el = document.getElementById("alertsList");
  if (!el) return;
  el.innerHTML = `<div class="muted small">Sin alertas por ahora.</div>`;
}

/* =========================
   Theme button
========================= */
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
  paintIcon(current);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const now = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    applyTheme(now === "light" ? "dark" : "light");
  });
}

/* =========================
   Auth
========================= */
async function requireAuthOrRedirect() {
  // 1) Supabase
  try {
    const { data, error } = await supabase.auth.getUser();
    const sbUser = data?.user;

    if (sbUser && !error) {
      let biz = null;
      try { biz = await getBusinessByOwnerSB(sbUser.id); } catch {}

      const localMatch = getUsers().find(
        u => (u.email || "").toLowerCase() === (sbUser.email || "").toLowerCase()
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
            localMatch?.username ||
            "Usuario",
          user_metadata: sbUser.user_metadata || {},
        },
        biz,
        auth: "supabase",
      };
    }
  } catch {}

  // 2) Local session
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
  if (!biz) {
    window.location.href = "Index.html";
    return null;
  }

  return { user, biz, auth: "local" };
}

function setupLogout() {
  const confirmBtn = document.getElementById("confirmLogout");
  confirmBtn?.addEventListener("click", async () => {
    try { await supabase.auth.signOut(); } catch {}
    clearSession();
    window.location.href = "Index.html";
  });
}

/* =========================
   Date helpers (local -> ISO UTC)
========================= */
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function nowHHMM() {
  const d = new Date();
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/* =========================
   STOCK CRÍTICO (Supabase + fallback local)
========================= */
async function countCriticalStockSB(bizId) {
  const { data, error } = await supabase
    .from("products")
    .select("stock,min_stock,is_active")
    .eq("business_id", bizId)
    .eq("is_active", true);

  if (error) throw error;

  const rows = data || [];
  let critical = 0;

  for (const p of rows) {
    const stock = Number(p.stock ?? 0);
    const min = Number(p.min_stock ?? 0);

    const isCrit =
      stock === 0 ||
      (min > 0 && stock <= min) ||
      (min === 0 && stock > 0 && stock <= 3);

    if (isCrit) critical++;
  }
  return critical;
}
function countCriticalStockLocal(prodArr = []) {
  let critical = 0;
  for (const x of prodArr) {
    const qty = Number(x.stock ?? x.qty ?? x.quantity ?? 0);
    const min = Number(x.minStock ?? x.min_stock ?? x.min ?? 0);

    const isCrit =
      qty === 0 ||
      (min > 0 && qty <= min) ||
      (min === 0 && qty > 0 && qty <= 3);

    if (isCrit) critical++;
  }
  return critical;
}
function findArrayFromStorage(keys) {
  for (const k of keys) {
    const arr = safeJSON(k, null);
    if (Array.isArray(arr)) return { key: k, arr };
  }
  return null;
}

async function loadSalesTodaySB(bizId) {
  const since = startOfTodayISO();

  // intento 1: con paid
  let r = await supabase
    .from("sales")
    .select("id,total,status,created_at,payment_method")
    .eq("business_id", bizId)
    .gte("created_at", since)
    .in("status", ["paid"])
    .order("created_at", { ascending: false });

  if (!r.error) return r.data || [];

  const msg = String(r.error?.message || "");
  if (msg.includes("invalid input value for enum")) {
    const r2 = await supabase
      .from("sales")
      .select("id,total,status,created_at,payment_method")
      .eq("business_id", bizId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (r2.error) throw r2.error;
    return r2.data || [];
  }

  throw r.error;
}


async function loadRecentSalesSB(bizId, limit = 6) {
  // Sin status: para no perder ventas si manejas status distinto
  const { data, error } = await supabase
    .from("sales")
    .select("id,total,status,created_at,payment_method")
    .eq("business_id", bizId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/* =========================
   Render sales recientes (Dashboard)
========================= */
function renderRecentSalesList(rows = []) {
  const wrap = document.getElementById("dashRecentSalesList");
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted small">Aún no hay ventas registradas.</div>`;
    return;
  }

  wrap.innerHTML = rows.map((s) => {
    const ms = Date.parse(s.created_at);
    const time = Number.isNaN(ms)
      ? "—"
      : new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });


    return `

    `;
  }).join("");
}

/* =========================
   Welcome
========================= */
function renderWelcome(user, biz) {
  const el = document.getElementById("docWelcomeTitle");
  if (!el) return;

  const nombre = firstName(pickUserDisplayName(user));
  const bizName = biz?.name ? ` — ${biz.name}` : "";
  el.textContent = `Bienvenido, ${nombre}${bizName}`;
}

/* =========================
   KPIs + Ventas recientes
========================= */
async function renderKpis(ctx) {
  clearAlert();

  const bizId = ctx?.biz?.id;

  // Defaults
  let todayTotal = 0;
  let ticketsHoy = 0;
  let avg = 0;
  let stockBajo = 0;

  const hhmm = nowHHMM();
  setText("dashNowLabel", `Ahora · ${hhmm}`);

  // --- SUPABASE MODE ---
  if (bizId && ctx.auth === "supabase") {
    try {
      const todayRows = await loadSalesTodaySB(bizId);
      todayTotal = (todayRows || []).reduce((acc, s) => acc + Number(s.total || 0), 0);
      ticketsHoy = (todayRows || []).length;
      avg = ticketsHoy ? (todayTotal / ticketsHoy) : 0;

      const recent = await loadRecentSalesSB(bizId, 6);
      renderRecentSalesList(recent);

    } catch (e) {
      // IMPORTANT: si te bloquea RLS aquí lo vas a ver en Alertas rápidas
      console.warn("Dashboard sales SB error:", e);
      setAlert(`No pude leer ventas desde Supabase. Revisa RLS/permisos en tabla "sales". (${e?.message || e})`);
      renderRecentSalesList([]);
    }

    try {
      stockBajo = await countCriticalStockSB(bizId);
    } catch (e) {
      console.warn("Stock crítico SB falló:", e);
      setAlert(`No pude leer stock desde Supabase. Revisa RLS/permisos en tabla "products". (${e?.message || e})`);
      // fallback local
      const prodHit = findArrayFromStorage(["pos_products_v1","pos_products","pos_inventory","pos_stock","pos_items"]);
      stockBajo = countCriticalStockLocal(prodHit?.arr || []);
    }
  } else {
    // --- LOCAL MODE (fallback) ---
    const salesHit = findArrayFromStorage(["pos_sales_v1","pos_sales","pos_orders","pos_transactions","pos_receipts","pos_tickets"]);
    const todayKey = (() => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    })();

    if (salesHit?.arr?.length) {
      const mine = bizId ? salesHit.arr.filter(x => (x.bizId || x.businessId) === bizId) : salesHit.arr;
      const todaySales = mine.filter(x => {
        const dt = x.createdAt || x.date || x.timestamp || x.time || x.fecha || x.created_at;
        const dd = new Date(dt);
        if (Number.isNaN(dd.getTime())) return false;
        const yyyy = dd.getFullYear();
        const mm = String(dd.getMonth() + 1).padStart(2, "0");
        const da = String(dd.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${da}` === todayKey;
      });
      todayTotal = todaySales.reduce((acc, x) => acc + Number(x.total || 0), 0);
      ticketsHoy = todaySales.length;
      avg = ticketsHoy ? (todayTotal / ticketsHoy) : 0;
    }

    // recent list local (simple)
    renderRecentSalesList([]);
    const prodHit = findArrayFromStorage(["pos_products_v1","pos_products","pos_inventory","pos_stock","pos_items"]);
    stockBajo = countCriticalStockLocal(prodHit?.arr || []);
  }

  // Paint KPIs
  setText("kpiSales", fmtMoney(todayTotal));
  setText("kpiTickets", String(ticketsHoy));
  setText("kpiAvg", fmtMoney(avg));
  setText("kpiLowStock", String(stockBajo));
  setText("kpiSalesHint", `Actualizado: ${hhmm}`);
}

/* =========================
   INIT
========================= */
(async function init() {
  setupTheme();

  const data = await requireAuthOrRedirect();
  if (!data) return;

  // reintento biz si supabase vino null
  if (data.auth === "supabase" && !data.biz?.id) {
    try { data.biz = await getBusinessByOwnerSB(data.user.id); } catch {}
  }

  window.__CTX__ = data;

  renderWelcome(data.user, data.biz);
  renderBrand(data.biz);
  setupLogout();

  await renderKpis(data);

  window.addEventListener("focus", async () => {
    const ctx = window.__CTX__;
    if (ctx) await renderKpis(ctx);
  });
})();
