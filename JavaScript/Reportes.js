const SESSION_KEY = "pos_session";
const USERS_KEY = "pos_users";
const BUSINESSES_KEY = "pos_businesses";

// ✅ IMPORTANTE: faltaba esta constante
const SALES_KEY = "pos_sales_v1";

// (no lo usas aquí, pero no estorba tenerlo)
const PRODUCTS_KEY = "pos_products_v1";

function jget(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function getSession() { return jget(SESSION_KEY, null); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getUsers() { return jget(USERS_KEY, []); }
function getBusinesses() { return jget(BUSINESSES_KEY, []); }
function getSales() { return jget(SALES_KEY, []).map(normalizeSale); }

// ✅ compat: ventas nuevas usan bizId, viejas businessId
function normalizeSale(s) {
  if (!s) return s;
  if (!s.bizId && s.businessId) s.bizId = s.businessId;
  return s;
}

function requireBizOrRedirect() {
  const s = getSession();
  if (!s?.userId) { window.location.href = "Index.html"; return null; }

  const u = getUsers().find(x => x.id === s.userId);
  if (!u) { clearSession(); window.location.href = "Index.html"; return null; }

  const biz = getBusinesses().find(b => b.ownerUserId === s.userId);
  if (!biz) { window.location.href = "Index.html"; return null; }

  return { user: u, biz };
}

function money(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function ymdLocal(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function inRange(dateISO, fromYMD, toYMD) {
  const d = new Date(dateISO);
  const from = fromYMD ? parseYMD(fromYMD) : null;
  const to = toYMD ? new Date(parseYMD(toYMD).getTime() + 24 * 60 * 60 * 1000 - 1) : null;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ===== Charts state =====
let chartDaily = null, chartMethods = null, chartTop = null, chartEmp = null;
function destroyChart(c) { if (c && typeof c.destroy === "function") c.destroy(); }

// ===== Aggregations =====
function groupByDay(sales) {
  const map = new Map();
  for (const s of sales) {
    const day = ymdLocal(s.createdAt);
    map.set(day, (map.get(day) || 0) + Number(s.total || 0));
  }
  const days = [...map.keys()].sort();
  return { labels: days, values: days.map(d => map.get(d) || 0) };
}

function groupByMethod(sales) {
  const map = new Map();
  for (const s of sales) {
    const m = (s.method || "Efectivo").trim();
    map.set(m, (map.get(m) || 0) + Number(s.total || 0));
  }
  const labels = [...map.keys()];
  return { labels, values: labels.map(l => map.get(l) || 0) };
}

function topProducts(sales, topN = 7) {
  const map = new Map();
  for (const s of sales) {
    for (const it of (s.items || [])) {
      const name = it.name || it.productId || "Producto";
      map.set(name, (map.get(name) || 0) + Number(it.qty || 1));
    }
  }
  const arr = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  return { labels: arr.map(x => x[0]), values: arr.map(x => x[1]) };
}

function employeePerf(sales) {
  const map = new Map();
  for (const s of sales) {
    const emp = s.employeeName || "Sin asignar";
    const rec = map.get(emp) || { sales: 0, income: 0, items: 0 };
    rec.sales += 1;
    rec.income += Number(s.total || 0);
    rec.items += (s.items || []).reduce((a, it) => a + Number(it.qty || 1), 0);
    map.set(emp, rec);
  }
  return [...map.entries()].sort((a, b) => b[1].income - a[1].income);
}

function projection30(dailyValues) {
  const last = dailyValues.slice(-14);
  const avg = last.length ? (last.reduce((a, b) => a + b, 0) / last.length) : 0;
  return avg * 30;
}

// ===== Render =====
function setKpis({ income, salesCount, avgTicket, proj30 }) {
  const elIncome = document.getElementById("kpiIncome");
  const elSales = document.getElementById("kpiSales");
  const elAvg = document.getElementById("kpiAvg");
  const elProj = document.getElementById("kpiProjection");

  if (elIncome) elIncome.textContent = money(income);
  if (elSales) elSales.textContent = String(salesCount);
  if (elAvg) elAvg.textContent = money(avgTicket);
  if (elProj) elProj.textContent = money(proj30);
}

function renderEmployeesTable(empArr) {
  const tb = document.getElementById("employeesTable");
  if (!tb) return;

  if (empArr.length === 0) {
    tb.innerHTML = `<tr><td colspan="4" class="text-secondary text-center">No hay datos de empleados todavía</td></tr>`;
    return;
  }

  tb.innerHTML = empArr.map(([name, r]) => {
    const avg = r.sales ? (r.income / r.sales) : 0;
    return `
      <tr>
        <td>${name}</td>
        <td class="text-end">${r.sales}</td>
        <td class="text-end">${money(r.income)}</td>
        <td class="text-end">${money(avg)}</td>
      </tr>
    `;
  }).join("");
}

function renderCharts(daily, methods, top, empArr) {
  // Si no cargaste Chart.js en el HTML, no habrá gráficas
  if (!window.Chart) return;

  const ctxDaily = document.getElementById("chartDaily");
  const ctxMethods = document.getElementById("chartMethods");
  const ctxTop = document.getElementById("chartTopProducts");
  const ctxEmp = document.getElementById("chartEmployees");
  if (!ctxDaily || !ctxMethods || !ctxTop || !ctxEmp) return;

  destroyChart(chartDaily); destroyChart(chartMethods); destroyChart(chartTop); destroyChart(chartEmp);

  chartDaily = new Chart(ctxDaily, {
    type: "line",
    data: { labels: daily.labels, datasets: [{ label: "Ingresos", data: daily.values, tension: 0.35 }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  chartMethods = new Chart(ctxMethods, {
    type: "doughnut",
    data: { labels: methods.labels, datasets: [{ data: methods.values }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });

  chartTop = new Chart(ctxTop, {
    type: "bar",
    data: { labels: top.labels, datasets: [{ label: "Unidades", data: top.values }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  const empLabels = empArr.map(x => x[0]);
  const empIncome = empArr.map(x => x[1].income);

  chartEmp = new Chart(ctxEmp, {
    type: "bar",
    data: { labels: empLabels, datasets: [{ label: "Ingresos", data: empIncome }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function applyFilters(allSales, bizId) {
  const from = document.getElementById("fromDate")?.value || "";
  const to = document.getElementById("toDate")?.value || "";
  const method = document.getElementById("methodFilter")?.value || "";

  return allSales
    // ✅ CAMBIO CLAVE: filtrar por bizId (compat con businessId ya normalizado)
    .filter(s => s.bizId === bizId)
    .filter(s => inRange(s.createdAt, from, to))
    .filter(s => !method || (s.method || "Efectivo") === method);
}

function renderAll(state) {
  const bizLabel = document.getElementById("bizLabel");
  if (bizLabel) bizLabel.textContent = `${state.biz.name} — @${state.biz.handle}`;

  const all = getSales();
  const filtered = applyFilters(all, state.biz.id);

  const income = filtered.reduce((a, s) => a + Number(s.total || 0), 0);
  const salesCount = filtered.length;
  const avgTicket = salesCount ? income / salesCount : 0;

  const daily = groupByDay(filtered);
  const methods = groupByMethod(filtered);
  const top = topProducts(filtered, 7);
  const empArr = employeePerf(filtered);

  const proj30 = projection30(daily.values);

  setKpis({ income, salesCount, avgTicket, proj30 });
  renderCharts(daily, methods, top, empArr);
  renderEmployeesTable(empArr);
}

function setDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);

  const fmt = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  document.getElementById("fromDate") && (document.getElementById("fromDate").value = fmt(from));
  document.getElementById("toDate") && (document.getElementById("toDate").value = fmt(to));
}

// ===== Logout modal =====
function wireLogoutReportes() {
  const btn = document.getElementById("btnLogoutRep");
  const modalEl = document.getElementById("logoutModal");
  const confirmBtn = document.getElementById("confirmLogout");

  if (!btn) return;

  if (!modalEl || !window.bootstrap?.Modal) {
    btn.addEventListener("click", () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) {
        clearSession();
        window.location.href = "Index.html";
      }
    });
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  btn.addEventListener("click", () => modal.show());
  confirmBtn?.addEventListener("click", () => {
    clearSession();
    window.location.href = "Index.html";
  });
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  const state = requireBizOrRedirect();
  if (!state) return;

  setDefaultDates();
  renderAll(state);

  document.getElementById("btnApply")?.addEventListener("click", () => renderAll(state));
  document.getElementById("btnReset")?.addEventListener("click", () => {
    const mf = document.getElementById("methodFilter");
    if (mf) mf.value = "";
    setDefaultDates();
    renderAll(state);
  });

  wireLogoutReportes();
});
