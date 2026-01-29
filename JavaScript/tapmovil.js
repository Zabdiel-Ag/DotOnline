document.querySelectorAll(".ios-tabbar .ios-tab").forEach(tab => {
  const href = tab.getAttribute("href");
  if (location.pathname.endsWith(href)) {
    tab.classList.add("active");
  } else {
    tab.classList.remove("active");
  }
});



document.querySelectorAll(".ios-tab").forEach(tab => {
  tab.addEventListener("touchstart", () => {
    tab.classList.add("tap-active");
  });

  tab.addEventListener("touchend", () => {
    setTimeout(() => tab.classList.remove("tap-active"), 150);
  });

  tab.addEventListener("mousedown", () => {
    tab.classList.add("tap-active");
  });

  tab.addEventListener("mouseup", () => {
    setTimeout(() => tab.classList.remove("tap-active"), 150);
  });

  tab.addEventListener("mouseleave", () => {
    tab.classList.remove("tap-active");
  });
});

/* =========================
   iOS GLASS TAB — TAP FX
========================= */

const tabs = document.querySelectorAll(".ios-tab");

tabs.forEach((tab) => {
  // animación touch
  tab.addEventListener("touchstart", () => tab.classList.add("tap-active"), { passive: true });

  tab.addEventListener("touchend", () => {
    setTimeout(() => tab.classList.remove("tap-active"), 140);
  });

  // animación mouse (desktop pruebas)
  tab.addEventListener("mousedown", () => tab.classList.add("tap-active"));
  tab.addEventListener("mouseup", () => setTimeout(() => tab.classList.remove("tap-active"), 140));
  tab.addEventListener("mouseleave", () => tab.classList.remove("tap-active"));

  // activar visualmente el seleccionado (aunque redirija)
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
  });
});

