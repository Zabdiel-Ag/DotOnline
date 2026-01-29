// JavaScript/theme.js
(() => {
  const THEME_KEY = "appTheme";
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
    try {
      localStorage.setItem(THEME_KEY, normalizeTheme(theme));
    } catch {}
  };

  const updateThemeBtn = (theme) => {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;

    const isLight = theme === "light";
    btn.innerHTML = isLight
      ? `<i class="bi bi-sun"></i>`
      : `<i class="bi bi-moon-stars"></i>`;

    btn.setAttribute("aria-label", isLight ? "Tema claro" : "Tema oscuro");
    btn.title = isLight ? "Tema claro" : "Tema oscuro";
  };

  const applyTheme = (theme) => {
    const t = normalizeTheme(theme);
    const root = document.documentElement;

    // Bootstrap theme
    root.setAttribute("data-bs-theme", t);

    // opcional para tu CSS custom
    root.dataset.theme = t;

    // opcional si usas .theme-light
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

  document.addEventListener("DOMContentLoaded", () => applyTheme(getSavedTheme()), { once: true });
})();
