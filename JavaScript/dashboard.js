/* =========================
   DASHBOARD.JS (FIXED)
   ========================= */

const USERS_KEY = "pos_users";
const SESSION_KEY = "pos_session";
const BUSINESSES_KEY = "pos_businesses";
const POSTS_KEY = "pos_posts";

/* -------------------------
   Storage utils
-------------------------- */
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
function getBusinesses() { return safeJSON(BUSINESSES_KEY, []); }
function getBusinessByOwner(userId) {
  return getBusinesses().find(b => b.ownerUserId === userId) || null;
}

/* -------------------------
   Auth
-------------------------- */
function requireAuthOrRedirect() {
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

  const biz = getBusinessByOwner(session.userId);
  if (!biz) {
    window.location.href = "Index.html";
    return null;
  }

  return { user, biz };
}

/* -------------------------
   UI helpers
-------------------------- */
function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "B";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

function fmtMoney(n) {
  const x = Number(n || 0);
  try {
    return x.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  } catch {
    return "$" + x.toFixed(2);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* -------------------------
   Date helpers (LOCAL)
-------------------------- */
function localDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`; // LOCAL
}

/* -------------------------
   Normalizers (bizId compat)
-------------------------- */
function normalizeBizId(x) {
  if (!x || typeof x !== "object") return x;
  if (!x.bizId && x.businessId) x.bizId = x.businessId;
  if (!x.businessId && x.bizId) x.businessId = x.bizId;
  return x;
}

/* -------------------------
   Find arrays in localStorage
   (THIS WAS MISSING IN YOUR FILE ✅)
-------------------------- */
function findArrayFromStorage(keys) {
  for (const k of keys) {
    const arr = safeJSON(k, null);
    if (Array.isArray(arr)) return { key: k, arr };
  }
  return null;
}

/* -------------------------
   Business render
-------------------------- */
function renderBusiness(biz) {
  const bizNameRight = document.getElementById("bizNameRight");
  const bizCategoryRight = document.getElementById("bizCategoryRight");
  const bizHandleRight = document.getElementById("bizHandleRight");
  const bizLogoImg = document.getElementById("bizLogoImg");
  const bizLogoFallback = document.getElementById("bizLogoFallback");

  if (bizNameRight) bizNameRight.textContent = biz.name;
  if (bizCategoryRight) bizCategoryRight.textContent = biz.category;
  if (bizHandleRight) bizHandleRight.textContent = "@" + biz.handle;

  const bizMiniLabel = document.getElementById("bizMiniLabel");
  if (bizMiniLabel) bizMiniLabel.textContent = "@" + biz.handle;

  const bizNameFeed = document.getElementById("bizNameFeed");
  const bizHandleFeed = document.getElementById("bizHandleFeed");
  const bizCategoryFeed = document.getElementById("bizCategoryFeed");
  const bizAvatar = document.getElementById("bizAvatar");

  if (bizNameFeed) bizNameFeed.textContent = biz.name;
  if (bizHandleFeed) bizHandleFeed.textContent = "@" + biz.handle;
  if (bizCategoryFeed) bizCategoryFeed.textContent = biz.category;

  if (biz.logoDataUrl) {
    if (bizLogoImg) {
      bizLogoImg.src = biz.logoDataUrl;
      bizLogoImg.classList.remove("d-none");
    }
    if (bizLogoFallback) bizLogoFallback.classList.add("d-none");

    if (bizAvatar) {
      bizAvatar.style.backgroundImage = `url(${biz.logoDataUrl})`;
      bizAvatar.style.backgroundSize = "cover";
      bizAvatar.style.backgroundPosition = "center";
      bizAvatar.textContent = "";
    }
  } else {
    if (bizLogoImg) bizLogoImg.classList.add("d-none");
    if (bizLogoFallback) {
      bizLogoFallback.classList.remove("d-none");
      bizLogoFallback.textContent = "🏪";
    }
    if (bizAvatar) {
      bizAvatar.style.backgroundImage = "";
      bizAvatar.textContent = initialsFromName(biz.name);
    }
  }
}

/* -------------------------
   Team (connected)
-------------------------- */
function readTeamForBiz(bizId) {
  const candidates = [
    "pos_team",
    "pos_employees",
    "pos_staff",
    "pos_users_business",
    "pos_connected_users"
  ];

  for (const k of candidates) {
    const arr = safeJSON(k, null);
    if (!Array.isArray(arr)) continue;

    const filtered = arr
      .map(normalizeBizId)
      .filter(x => x && typeof x === "object" ? (x.bizId ? x.bizId === bizId : true) : false);

    if (filtered.length) return filtered;
  }
  return null;
}

function renderTeam(ctx) {
  const teamList = document.getElementById("teamList");
  if (!teamList) return;

  const real = readTeamForBiz(ctx.biz.id);

  const demo = [
    { name: "Mariana", role: "Cajero" },
    { name: "Luis", role: "Inventario" },
    { name: "Andrea", role: "Admin" },
    { name: "Héctor", role: "Ventas" },
  ];

  const list = (real && real.length)
    ? real.map(x => ({
        name: x.name || x.fullName || x.username || "Usuario",
        role: x.role || x.rol || x.position || "Empleado",
      }))
    : demo;

  teamList.innerHTML = list.map(x => `
    <div class="suggest">
      <div class="suggest-left">
        <div class="suggest-avatar">${initialsFromName(x.name)}</div>
        <div>
          <div class="fw-semibold">${x.name}</div>
          <div class="small2">Rol: ${x.role}</div>
        </div>
      </div>
      <button class="btn btn-link btn-sm link-light" style="text-decoration:none;">Conectar</button>
    </div>
  `).join("");
}

/* -------------------------
   Nav
-------------------------- */
function setupNav() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const screen = btn.getAttribute("data-screen");
      if (screen === "pos") window.location.href = "Pos.html";
    });
  });
}

function setupBottomNav() {
  const items = document.querySelectorAll(".bottom-nav .bn-item");
  if (!items.length) return;

  items.forEach(a => {
    a.addEventListener("click", () => {
      items.forEach(x => x.classList.remove("active"));
      a.classList.add("active");
    });
  });
}

/* -------------------------
   Logout
-------------------------- */
function setupLogout() {
  const btn1 = document.getElementById("btnLogoutDash");
  const btn2 = document.getElementById("btnLogoutDashMobile");

  const modalEl =
    document.getElementById("logoutModal") ||
    document.getElementById("logoutModalDash");

  const confirmBtn =
    document.getElementById("confirmLogout") ||
    document.getElementById("confirmLogoutDash");

  const doLogout = () => {
    clearSession();
    window.location.href = "Index.html";
  };

  const fallback = () => {
    if (confirm("¿Seguro que deseas cerrar sesión?")) doLogout();
  };

  if (!modalEl || !window.bootstrap?.Modal) {
    btn1?.addEventListener("click", fallback);
    btn2?.addEventListener("click", fallback);
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  btn1?.addEventListener("click", () => modal.show());
  btn2?.addEventListener("click", () => modal.show());
  confirmBtn?.addEventListener("click", doLogout);
}

/* -------------------------
   Theme
-------------------------- */
function setupTheme() {
  const btn = document.getElementById("btnTheme");
  if (!btn) return;

  const KEY = "dash_theme";
  const saved = localStorage.getItem(KEY);
  if (saved === "light") document.body.classList.add("theme-light");

  const paintIcon = () => {
    const isLight = document.body.classList.contains("theme-light");
    btn.innerHTML = isLight
      ? '<i class="bi bi-sun"></i>'
      : '<i class="bi bi-moon-stars"></i>';
  };

  paintIcon();

  btn.addEventListener("click", () => {
    document.body.classList.toggle("theme-light");
    localStorage.setItem(KEY, document.body.classList.contains("theme-light") ? "light" : "dark");
    paintIcon();
  });

  const mirror = document.getElementById("btnThemeMirror");
  if (mirror) mirror.addEventListener("click", () => btn.click());
}

/* -------------------------
   Breakdown
-------------------------- */
function setupBreakdownToggle() {
  const btn = document.getElementById("btnBreakdown");
  const box = document.getElementById("breakdownBox");
  if (!btn || !box) return;

  btn.addEventListener("click", () => {
    box.classList.toggle("d-none");
  });
}

/* -------------------------
   KPIs (FIXED ✅)
-------------------------- */
function renderKpis(ctx) {
  // ✅ usa tus keys reales v1 + fallback
  const salesHit = findArrayFromStorage([
    "pos_sales_v1",
    "pos_sales",
    "pos_orders",
    "pos_transactions",
    "pos_receipts",
    "pos_tickets"
  ]);

  const prodHit = findArrayFromStorage([
    "pos_products_v1",
    "pos_products",
    "pos_inventory",
    "pos_stock",
    "pos_items"
  ]);

  const alertHit = findArrayFromStorage([
    "pos_alerts",
    "pos_notifications",
    "pos_warnings"
  ]);

  const team = readTeamForBiz(ctx.biz.id);
  const connectedCount = Array.isArray(team) ? team.length : 0;

  // ===== SALES =====
  let todayTotal = 0;
  let ticketsHoy = 0;

  if (salesHit?.arr?.length) {
    const today = localDateKey();

    const mine = salesHit.arr
      .map(normalizeBizId)
      .filter(x => x?.bizId === ctx.biz.id);

    const todaySales = mine.filter(x => {
      const dt = x.createdAt || x.date || x.timestamp || x.time || x.fecha;
      const dd = new Date(dt);
      if (isNaN(dd.getTime())) return false;
      return localDateKey(dd) === today;
    });

    todayTotal = todaySales.reduce((acc, x) => acc + Number(x.total || 0), 0);
    ticketsHoy = todaySales.length;
  }

  // ===== INVENTORY =====
  let totalProductos = 0;
  let stockBajo = 0;

  if (prodHit?.arr?.length) {
    const mine = prodHit.arr
      .map(normalizeBizId)
      .filter(x => x?.bizId === ctx.biz.id);

    totalProductos = mine.length;

    stockBajo = mine.reduce((acc, x) => {
      const qty = Number(x.stock ?? x.qty ?? x.quantity ?? 0);
      const min = Number(x.minStock ?? x.min ?? 0);
      if (min > 0 && qty <= min) return acc + 1;
      if (min === 0 && qty > 0 && qty <= 3) return acc + 1;
      return acc;
    }, 0);
  }

  // ===== ALERTS =====
  let alertasPendientes = 0;
  if (alertHit?.arr?.length) {
    alertasPendientes = alertHit.arr.length;
  } else {
    // fallback: stock bajo = alertas
    alertasPendientes = stockBajo;
  }

  // ===== Paint =====
  setText("todayTotalChip", todayTotal ? `${fmtMoney(todayTotal)} hoy` : "—");
  setText("kpiTickets", ticketsHoy ? String(ticketsHoy) : "—");
  setText("kpiInventario", totalProductos ? String(totalProductos) : "—");
  setText("kpiAlertas", alertasPendientes ? String(alertasPendientes) : "—");

  setText("sumProductos", totalProductos ? String(totalProductos) : "—");
  setText("sumStockBajo", stockBajo ? String(stockBajo) : "—");
  setText("sumConectados", connectedCount ? String(connectedCount) : "—");
}

/* =======================
   POSTS (Marketing Feed)
======================= */
function getPosts() { return safeJSON(POSTS_KEY, []); }
function savePosts(posts) { localStorage.setItem(POSTS_KEY, JSON.stringify(posts)); }

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function hideErr(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24); return `${days}d`;
}
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderFeed(ctx) {
  const feed = document.getElementById("feed");
  if (!feed) return;

  const posts = getPosts()
    .filter(p => p.businessId === ctx.biz.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (posts.length === 0) {
    // no rompas placeholder si lo usas en HTML
    // (si quieres, aquí puedes pintar un mensaje “sin posts”)
    return;
  }

  feed.innerHTML = posts.map(p => {
    const headerName = ctx.biz.name;
    const headerHandle = "@" + ctx.biz.handle;
    const label = p.type?.toUpperCase() || "POST";

    const mediaHtml = p.mediaType?.startsWith("video/")
      ? `<video src="${p.mediaDataUrl}" controls class="w-100" style="border-radius:16px; max-height:420px; object-fit:cover;"></video>`
      : `<img src="${p.mediaDataUrl}" alt="post" class="w-100" style="border-radius:16px; max-height:420px; object-fit:cover;">`;

    return `
      <article class="post cardx p-3">
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <div class="avatar">${(headerName || "E")[0].toUpperCase()}</div>
            <div>
              <div class="fw-semibold">${headerName}</div>
              <div class="small muted">${headerHandle} · ${timeAgo(p.createdAt)} · <span class="badge-soft px-2 py-1">${label}</span></div>
            </div>
          </div>
          <button class="btn btn-soft btn-sm" data-del-post="${p.id}">🗑</button>
        </div>

        <div class="mt-3">${mediaHtml}</div>

        ${p.caption ? `<div class="mt-3"><span class="fw-semibold">${headerHandle}</span> <span class="muted">${escapeHtml(p.caption)}</span></div>` : ""}

        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-soft" data-like="${p.id}">❤</button>
          <button class="btn btn-soft" data-copy="${p.id}">↗</button>
          <div class="ms-auto chip">${p.type || "post"}</div>
        </div>
      </article>
    `;
  }).join("");

  feed.querySelectorAll("[data-del-post]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-post");
      const all = getPosts();
      savePosts(all.filter(x => x.id !== id));
      renderFeed(ctx);
    });
  });

  feed.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-copy");
      const p = getPosts().find(x => x.id === id);
      if (!p) return;
      navigator.clipboard?.writeText(p.caption || "");
    });
  });
}

function setupCreatePost() {
  const btnOpen = document.getElementById("btnOpenPost");
  const input = document.getElementById("postMedia");
  const caption = document.getElementById("postCaption");
  const type = document.getElementById("postType");
  const btnPublish = document.getElementById("btnPublishPost");
  const err = document.getElementById("postErr");

  const previewWrap = document.getElementById("postPreviewWrap");
  const img = document.getElementById("postPreviewImg");
  const vid = document.getElementById("postPreviewVideo");

  if (!btnOpen || !btnPublish) return;

  const modalEl = document.getElementById("postModal");
  const hasBootstrapModal = modalEl && window.bootstrap?.Modal;

  let mediaDataUrl = "";
  let mediaType = "";

  const openModal = () => {
    hideErr(err);
    if (input) input.value = "";
    if (caption) caption.value = "";
    if (type) type.value = "promo";
    mediaDataUrl = "";
    mediaType = "";
    previewWrap?.classList.add("d-none");
    img?.classList.add("d-none");
    vid?.classList.add("d-none");

    if (!hasBootstrapModal) {
      alert("Falta Bootstrap Modal para abrir el creador de post.");
      return;
    }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  };

  btnOpen.addEventListener("click", openModal);

  const openComposer = document.getElementById("btnOpenPostMirror");
  if (openComposer) openComposer.addEventListener("click", () => btnOpen.click());

  input?.addEventListener("change", async (e) => {
    hideErr(err);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
      showErr(err, "Archivo muy pesado. Usa máximo 12MB (por ahora).");
      input.value = "";
      return;
    }

    mediaType = file.type || "";
    mediaDataUrl = await fileToDataUrl(file);

    previewWrap?.classList.remove("d-none");

    if (mediaType.startsWith("video/")) {
      if (vid) {
        vid.src = mediaDataUrl;
        vid.classList.remove("d-none");
      }
      img?.classList.add("d-none");
    } else {
      if (img) {
        img.src = mediaDataUrl;
        img.classList.remove("d-none");
      }
      vid?.classList.add("d-none");
    }
  });

  btnPublish.addEventListener("click", () => {
    hideErr(err);

    const ctx = window.__CTX__;
    if (!ctx?.biz?.id) return showErr(err, "No hay empresa activa.");
    if (!mediaDataUrl) return showErr(err, "Sube una foto o video para publicar.");

    const post = {
      id: crypto.randomUUID(),
      businessId: ctx.biz.id,
      createdAt: new Date().toISOString(),
      caption: (caption?.value || "").trim(),
      type: type?.value || "promo",
      mediaType,
      mediaDataUrl
    };

    const posts = getPosts();
    posts.push(post);
    savePosts(posts);

    if (window.bootstrap?.Modal && document.getElementById("postModal")) {
      bootstrap.Modal.getOrCreateInstance(document.getElementById("postModal")).hide();
    }
    renderFeed(ctx);
  });
}

function setupEditBiz() {
  document.getElementById("btnEditBiz")?.addEventListener("click", () => {
    window.location.href = "Index.html";
  });
}

/* -------------------------
   INIT
-------------------------- */
(function init() {
  const data = requireAuthOrRedirect();
  if (!data) return;

  window.__CTX__ = data;

  renderBusiness(data.biz);
  renderTeam(data);

  setupNav();
  setupBottomNav();

  setupTheme();
  setupLogout();
  setupEditBiz();

  setupBreakdownToggle();
  renderKpis(data);

  renderFeed(data);
  setupCreatePost();
})();

// Recalcula KPIs al volver al tab y cuando cambie storage
window.addEventListener("focus", () => {
  const ctx = window.__CTX__;
  if (ctx) renderKpis(ctx);
});
window.addEventListener("storage", (e) => {
  const ctx = window.__CTX__;
  if (!ctx) return;

  // Solo recalcula si cambian llaves relevantes (más eficiente)
  const keys = new Set([
    "pos_sales_v1", "pos_sales", "pos_orders", "pos_transactions", "pos_receipts", "pos_tickets",
    "pos_products_v1", "pos_products", "pos_inventory", "pos_stock", "pos_items",
    "pos_alerts", "pos_notifications", "pos_warnings",
    "pos_connected_users", "pos_team", "pos_employees", "pos_staff", "pos_users_business"
  ]);

  if (!e || !e.key || keys.has(e.key)) renderKpis(ctx);
});
