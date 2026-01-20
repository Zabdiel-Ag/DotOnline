(() => {
  const THEME_KEY = "appTheme"; // "dark" | "light"
  const LIGHT_CLASS = "theme-light";

  function setThemeClass(isLight) {
    // Ponemos la clase en html Y body para que cualquier CSS lo detecte
    document.documentElement.classList.toggle(LIGHT_CLASS, isLight);
    document.body?.classList.toggle(LIGHT_CLASS, isLight);
  }

  function updateThemeIcon(isLight) {
    const btn = document.getElementById("btnTheme");
    if (!btn) return;

    btn.innerHTML = isLight
      ? `<i class="bi bi-sun"></i>`
      : `<i class="bi bi-moon-stars"></i>`;

    btn.setAttribute("aria-label", isLight ? "Tema claro" : "Tema oscuro");
    btn.title = isLight ? "Tema claro" : "Tema oscuro";
  }

  function applyTheme(theme) {
    const isLight = theme === "light";
    setThemeClass(isLight);
    updateThemeIcon(isLight);

    // (Opcional) ayuda a componentes que dependan del dataset
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  }

  function toggleTheme() {
    const isLightNow = document.documentElement.classList.contains(LIGHT_CLASS);
    const next = isLightNow ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1) aplica al cargar
    applyTheme(getSavedTheme());

    // 2) click del botón
    const btn = document.getElementById("btnTheme");
    if (btn) btn.addEventListener("click", toggleTheme);
  });

  // 3) sincroniza tema entre pestañas / páginas abiertas
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) {
      applyTheme(getSavedTheme());
    }
  });
})();
