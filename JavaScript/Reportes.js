import { supabase } from "./supabaseClient.js";

/* =========================
   Helpers
========================= */
function money(n, currency = "MXN") {
  const val = Number(n || 0);
  try {
    return val.toLocaleString("es-MX", { style: "currency", currency });
  } catch {
    return val.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }
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

function startISOFromYMD(ymd) {
  return parseYMD(ymd).toISOString();
}

function endISOFromYMDInclusive(ymd) {
  // fin inclusivo => usamos < nextDayStart
  const d = parseYMD(ymd);
  const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

function shortId(uuid) {
  try { return String(uuid).split("-")[0].toUpperCase(); }
  catch { return String(uuid || ""); }
}

/* =========================
   Header (empresa + logo)
   - usa ids del HTML DotLine:
     #brandNameText, #brandLogoImg, #bizLabel
========================= */
function renderBizHeader(biz) {
  const brandNameText = document.getElementById("brandNameText");
  const brandLogoImg = document.getElementById("brandLogoImg");
  const bizLabel = document.getElementById("bizLabel");

  const name = biz?.name || "DotLine";
  const handle = biz?.handle ? `@${biz.handle}` : "@negocio";

  if (brandNameText) brandNameText.textContent = name;

  // logo_url si existe
  const logoUrl = biz?.logo_url || "";
  if (brandLogoImg) {
    if (logoUrl) {
      brandLogoImg.src = logoUrl;
      brandLogoImg.classList.remove("d-none");
    } else {
      brandLogoImg.classList.add("d-none");
    }
  }

  if (bizLabel) bizLabel.textContent = `${name} — ${handle}`;
}

/* =========================
   Charts state
========================= */
let chartDaily = null, chartMethods = null, chartTop = null, chartEmp = null;
function destroyChart(c) { if (c && typeof c.destroy === "function") c.destroy(); }

/* =========================
   Aggregations
========================= */
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
    const m = String(s.method || "cash").trim();
    map.set(m, (map.get(m) || 0) + Number(s.total || 0));
  }
  const labels = [...map.keys()];

  // opcional: orden bonito
  const order = ["cash", "card", "transfer", "mixed"];
  labels.sort((a, b) => order.indexOf(a) - order.indexOf(b));

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
    // si no hay profiles, usamos created_by como "empleado"
    const emp = s.employeeName || (s.createdBy ? `Emp ${shortId(s.createdBy)}` : "Sin asignar");

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

/* =========================
   Render
========================= */
function setKpis({ income, salesCount, avgTicket, proj30, currency }) {
  const elIncome = document.getElementById("kpiIncome");
  const elSales = document.getElementById("kpiSales");
  const elAvg = document.getElementById("kpiAvg");
  const elProj = document.getElementById("kpiProjection");

  if (elIncome) elIncome.textContent = money(income, currency);
  if (elSales) elSales.textContent = String(salesCount);
  if (elAvg) elAvg.textContent = money(avgTicket, currency);
  if (elProj) elProj.textContent = money(proj30, currency);
}

function renderEmployeesTable(empArr, currency = "MXN") {
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
        <td class="text-end">${money(r.income, currency)}</td>
        <td class="text-end">${money(avg, currency)}</td>
      </tr>
    `;
  }).join("");
}

function renderCharts(daily, methods, top, empArr) {
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

/* =========================
   Supabase: Auth + Business + Sales
========================= */
async function requireAuthAndBusinessOrRedirect() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    window.location.href = "Index.html";
    return null;
  }

  // negocio por owner_id (si manejas multi-negocio, aquí puedes seleccionar uno)
  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id, name, handle, timezone, currency, owner_id, created_at, logo_url")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (bizErr || !biz) {
    console.error("biz error:", bizErr);
    window.location.href = "Index.html";
    return null;
  }

  return {
    user: { id: user.id, email: user.email },
    biz
  };
}

function getFilters() {
  const from = document.getElementById("fromDate")?.value || "";
  const to = document.getElementById("toDate")?.value || "";
  const method = document.getElementById("methodFilter")?.value || ""; // cash/card/transfer/mixed
  return { from, to, method };
}

async function fetchSalesFromSupabase({ bizId, fromYMD, toYMD, method }) {
  const startISO = fromYMD ? startISOFromYMD(fromYMD) : null;
  const endISO = toYMD ? endISOFromYMDInclusive(toYMD) : null;

  let q = supabase
    .from("sales")
    .select(`
      id,
      business_id,
      created_at,
      created_by,
      payment_method,
      total,
      subtotal,
      discount,
      note,
      sale_items (
        id,
        product_id,
        name,
        qty,
        unit_price,
        line_total
      )
    `)
    .eq("business_id", bizId)
    .order("created_at", { ascending: true });

  if (startISO) q = q.gte("created_at", startISO);
  if (endISO) q = q.lt("created_at", endISO);
  if (method) q = q.eq("payment_method", method);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map(s => ({
    id: s.id,
    bizId: s.business_id,
    createdAt: s.created_at,
    createdBy: s.created_by,
    method: s.payment_method || "cash",
    total: Number(s.total || 0),
    items: (s.sale_items || []).map(it => ({
      productId: it.product_id,
      name: it.name,
      qty: Number(it.qty || 0),
      unit_price: Number(it.unit_price || 0),
      line_total: Number(it.line_total || 0),
    })),
  }));
}

/* =========================
   Main render pipeline
========================= */
async function renderAll(state) {
  renderBizHeader(state.biz);

  const { from, to, method } = getFilters();

  const hint = document.getElementById("salesHint");
  if (hint) hint.textContent = "Cargando ventas...";

  let sales = [];
  try {
    sales = await fetchSalesFromSupabase({
      bizId: state.biz.id,
      fromYMD: from,
      toYMD: to,
      method
    });
    if (hint) hint.textContent = "Historial filtrado ✅";
  } catch (e) {
    console.error("fetchSales error:", e);
    if (hint) hint.textContent = "Error al cargar ventas (revisa RLS/permisos).";
    sales = [];
  }

  const currency = state.biz.currency || "MXN";

  const income = sales.reduce((a, s) => a + Number(s.total || 0), 0);
  const salesCount = sales.length;
  const avgTicket = salesCount ? income / salesCount : 0;

  const daily = groupByDay(sales);
  const methods = groupByMethod(sales);
  const top = topProducts(sales, 7);
  const empArr = employeePerf(sales);
  const proj30 = projection30(daily.values);

  setKpis({ income, salesCount, avgTicket, proj30, currency });
  renderCharts(daily, methods, top, empArr);
  renderEmployeesTable(empArr, currency);
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

  const elFrom = document.getElementById("fromDate");
  const elTo = document.getElementById("toDate");
  if (elFrom) elFrom.value = fmt(from);
  if (elTo) elTo.value = fmt(to);
}

/* =========================
   Logout
========================= */
function wireLogoutReportes() {
  const btn = document.getElementById("btnLogoutRep");
  const modalEl = document.getElementById("logoutModal");
  const confirmBtn = document.getElementById("confirmLogout");

  if (!btn) return;

  async function doLogout() {
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = "Index.html";
  }

  if (!modalEl || !window.bootstrap?.Modal) {
    btn.addEventListener("click", async () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) await doLogout();
    });
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  btn.addEventListener("click", () => modal.show());
  confirmBtn?.addEventListener("click", async () => {
    modal.hide();
    await doLogout();
  });
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  const state = await requireAuthAndBusinessOrRedirect();
  if (!state) return;



  setDefaultDates();
  await renderAll(state);

  document.getElementById("btnApply")?.addEventListener("click", async () => {
    await renderAll(state);
  });

  document.getElementById("btnReset")?.addEventListener("click", async () => {
    const mf = document.getElementById("methodFilter");
    if (mf) mf.value = "";
    setDefaultDates();
    await renderAll(state);
  });

  wireLogoutReportes();

     document.addEventListener("DOMContentLoaded", () => {
      const btnD = document.getElementById("btnTheme");
      const btnM = document.getElementById("btnTheme_m");
      if (btnD && btnM) btnM.addEventListener("click", () => btnD.click());
    });
});
