document.addEventListener("DOMContentLoaded", () => {
  const page = (location.pathname.split("/").pop() || "").toLowerCase();

  const map = [
    ["dashboard", "dashboard.html"],
    ["pos", "pos.html"],
    ["inventario", "inventario.html"],
    ["reportes", "reportes.html"],
    ["equipo", "equipo.html"]
  ];

  let current = "";
  for (const [key, file] of map) {
    if (page.includes(file)) current = key;
  }

  document.querySelectorAll(".topfb-tab").forEach(a => {
    a.classList.toggle("active", a.dataset.page === current);
  });
});
