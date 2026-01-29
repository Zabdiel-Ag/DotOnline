(() => {

  function normalizePath(str) {
    return (str || "")
      .toLowerCase()
      .trim()
      .split("?")[0]
      .split("#")[0];
  }

  function currentFile() {
    const raw = normalizePath(location.pathname);
    const file = raw.split("/").pop() || "";
    return file || "Dashboard.html";
  }

  const ROUTE_ALIASES = {
    "Dashboard.html": ["Dashboard.html", "index.html", ""],
    "Pos.html": ["pos.html", "caja.html", "ventas.html"],
    "Inventario.html": ["inventario.html", "stock.html", "almacen.html"],
    "Reportes.html": ["reportes.html", "reporte.html", "analytics.html"],
    "Equipo.html": ["equipo.html", "team.html", "usuarios.html"],
  };

  function isMatch(hrefFile, current) {
    // match directo
    if (hrefFile === current) return true;

    // match por alias
    for (const [canonical, list] of Object.entries(ROUTE_ALIASES)) {
      if (list.includes(current) && (hrefFile === canonical || list.includes(hrefFile))) {
        return true;
      }
    }

    return false;
  }

  function setActiveTab() {
    const file = currentFile();

    // Tabs del topbar
    const tabs = document.querySelectorAll(".topfb-center .topfb-tab[href]");
    if (!tabs.length) return;

    // Limpia y marca activo
    tabs.forEach((a) => {
      const href = normalizePath(a.getAttribute("href"));
      const hrefFile = href.split("/").pop(); // por si alguien pone /algo/Pos.html

      const active = isMatch(hrefFile, file);

      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    // Fallback extra: si NO encontró activo por href, intenta por data-screen
    // (Por ejemplo, si en producción cambias rutas pero mantienes data-screen)
    const anyActive = document.querySelector(".topfb-center .topfb-tab.active");
    if (!anyActive) {
      const byData = document.querySelector(
        `.topfb-center .topfb-tab[data-screen="${guessScreen(file)}"]`
      );
      if (byData) {
        byData.classList.add("active");
        byData.setAttribute("aria-current", "page");
      }
    }
  }

  function guessScreen(file) {
    // Adivina screen a partir del archivo (solo fallback)
    if (["Dashboard.html", "index.html", ""].includes(file)) return "home";
    if (["Pos.html", "caja.html", "ventas.html"].includes(file)) return "pos";
    if (["Inventario.html", "stock.html", "almacen.html"].includes(file)) return "inventory";
    if (["Reportes.html", "reporte.html", "analytics.html"].includes(file)) return "reports";
    if (["Equipo.html", "team.html", "usuarios.html"].includes(file)) return "team";
    return "";
  }

  // Si navegas con SPA/pushState (opcional), re-ejecuta al cambiar historial
  function hookHistory() {
    const _pushState = history.pushState;
    history.pushState = function () {
      _pushState.apply(history, arguments);
      setActiveTab();
    };
    window.addEventListener("popstate", setActiveTab);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setActiveTab();
    hookHistory();
  });
})();
