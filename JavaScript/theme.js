// JavaScript/theme.js
(() => {
  const THEME_KEY = "dotline_theme"; 
  const BTN_ID = "btnTheme";

  const normalizeTheme = (t) => (t === "light" ? "light" : "dark");

  const getSavedTheme = () => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "dark";
    } catch {
      return "dark";
    }
  };

  const setSavedTheme = (theme) => {
    try { localStorage.setItem(THEME_KEY, normalizeTheme(theme)); } catch {}
  };

  const updateThemeBtn = (theme) => {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const isLight = theme === "light";
    btn.innerHTML = isLight ? `<i class="bi bi-sun"></i>` : `<i class="bi bi-moon-stars"></i>`;
    btn.title = isLight ? "Tema claro" : "Tema oscuro";
    btn.setAttribute("aria-label", btn.title);
  };

  const applyTheme = (theme) => {
    const t = normalizeTheme(theme);
    const root = document.documentElement;

    root.setAttribute("data-bs-theme", t);
    root.dataset.theme = t;

    if (document.body) document.body.classList.toggle("theme-light", t === "light");

    updateThemeBtn(t);
  };

  const toggleTheme = () => {
    const next = getSavedTheme() === "light" ? "dark" : "light";
    setSavedTheme(next);
    applyTheme(next);
  };

  applyTheme(getSavedTheme());

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(`#${BTN_ID}`);
    if (!btn) return;
    e.preventDefault();
    toggleTheme();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) applyTheme(getSavedTheme());
  });

  window.addEventListener("pageshow", () => applyTheme(getSavedTheme()));
})();
