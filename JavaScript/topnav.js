(() => {
  function setActiveTab() {
    const path = (location.pathname.split("/").pop() || "").toLowerCase();

    // mapa archivo -> data-screen
    const map = {
      "dashboard.html": "home",
      "pos.html": "pos",
      "inventario.html": "inventory",
      "reportes.html": "reports",
      "equipo.html": "team",
    };

    const screen = map[path] || "home";

    document.querySelectorAll(".topfb-tab.nav-item").forEach(a => {
      const isActive = (a.dataset.screen === screen);
      a.classList.toggle("active", isActive);
      if (isActive) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  document.addEventListener("DOMContentLoaded", setActiveTab);
})();
