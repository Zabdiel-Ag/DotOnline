// JavaScript/boot.js
(() => {
  const LOGO_URL = "Multimedia/logo.png";
  const THEME_KEY = "appTheme";
  const root = document.documentElement;

  // ✅ SIEMPRE aplicar theme guardado lo más temprano posible
  try {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === "light" ? "light" : "dark";
    root.setAttribute("data-bs-theme", theme);
    root.dataset.theme = theme;
    document.body?.classList.toggle("theme-light", theme === "light");
  } catch {}

  const style = document.createElement("style");
  style.id = "boot-style";
  style.textContent = `
    #pageLoader{
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      pointer-events: none;
      opacity: 1;
      transition: opacity .28s ease;
      background:
        radial-gradient(1200px 600px at 12% 8%, rgba(120,140,255,.18), transparent 58%),
        radial-gradient(900px 520px at 92% 10%, rgba(0,255,200,.10), transparent 52%),
        radial-gradient(900px 520px at 60% 92%, rgba(255,120,200,.10), transparent 55%),
        rgba(10,12,16,.86);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    [data-bs-theme="light"] #pageLoader{
      background:
        radial-gradient(1200px 600px at 12% 8%, rgba(255,140,0,.18), transparent 58%),
        radial-gradient(900px 520px at 92% 10%, rgba(255,90,0,.12), transparent 52%),
        radial-gradient(900px 520px at 60% 92%, rgba(255,200,110,.14), transparent 55%),
        rgba(248,250,255,.90);
    }

    .loaderWrap{ display:flex; flex-direction:column; align-items:center; gap:14px; transform: translateY(-6px); animation: floaty 2.2s ease-in-out infinite; }
    @keyframes floaty{ 0%,100%{ transform: translateY(-6px); } 50%{ transform: translateY(-12px); } }

    .loaderLogo{ width: 78px; height: 78px; object-fit: contain; filter: drop-shadow(0 18px 40px rgba(0,0,0,.42)); }

    .loaderRing{
      width: 44px; height: 44px; border-radius: 999px;
      border: 3px solid rgba(255,255,255,.18);
      border-top-color: rgba(255,255,255,.9);
      animation: spin 1s linear infinite;
    }
    [data-bs-theme="light"] .loaderRing{
      border-color: rgba(255,140,0,.30);
      border-top-color: rgba(255,140,0,.95);
    }
    @keyframes spin{ to{ transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);

  function ensureLoader() {
    if (document.getElementById("pageLoader")) return;
    const div = document.createElement("div");
    div.id = "pageLoader";
    div.innerHTML = `
      <div class="loaderWrap">
        <img class="loaderLogo" src="${LOGO_URL}" alt="Cargando..." />
        <div class="loaderRing"></div>
      </div>
    `;
    root.appendChild(div);
  }

  function hideLoader() {
    const el = document.getElementById("pageLoader");
    if (!el) return;
    el.style.opacity = "0";
    setTimeout(() => {
      el.remove();
      document.getElementById("boot-style")?.remove();
    }, 320);
  }

  ensureLoader();

  window.addEventListener("load", () => {
    requestAnimationFrame(() => requestAnimationFrame(hideLoader));
  });

  window.addEventListener("beforeunload", () => {
    ensureLoader();
    const el = document.getElementById("pageLoader");
    if (el) el.style.opacity = "1";
  });

  // ✅ Sync si cambias tema en otra pestaña
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY) return;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const theme = saved === "light" ? "light" : "dark";
      root.setAttribute("data-bs-theme", theme);
      root.dataset.theme = theme;
      document.body?.classList.toggle("theme-light", theme === "light");
    } catch {}
  });
})();
