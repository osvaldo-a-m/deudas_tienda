// ===== Supabase client =====
const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ===== State =====
let clients = [];       // [{id, name, phone, notes, credit_limit, balance, daysSincePayment, overdue}]
let currentClientId = null;
let currentClientTx = [];
let showOnlyOverdue = false;

const OVERDUE_DAYS = 7;

// ===== DOM helpers =====
const $ = (id) => document.getElementById(id);

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(id).classList.add("active");
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2200);
}

function openModal(title, bodyHtml) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  $("modal-backdrop").hidden = false;
}

function closeModal() {
  $("modal-backdrop").hidden = true;
  $("modal-body").innerHTML = "";
}

$("modal-close").addEventListener("click", closeModal);
$("modal-backdrop").addEventListener("click", (e) => {
  if (e.target === $("modal-backdrop")) closeModal();
});

// ===== Modo de texto grande (accesibilidad) =====
function setA11yLargeText(enabled) {
  document.documentElement.classList.toggle("a11y-large", enabled);
  $("btn-a11y").classList.toggle("active", enabled);
  $("btn-a11y").title = enabled ? "Desactivar texto grande" : "Activar texto grande";
  localStorage.setItem("a11yLargeText", enabled ? "1" : "0");
}

$("btn-a11y").addEventListener("click", () => {
  const isEnabled = document.documentElement.classList.contains("a11y-large");
  setA11yLargeText(!isEnabled);
});

setA11yLargeText(localStorage.getItem("a11yLargeText") === "1");

// ===== Clients list =====
async function loadClients() {
  const { data: clientRows, error: cErr } = await db
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (cErr) {
    toast("Error al cargar clientes");
    return;
  }

  const { data: balances, error: bErr } = await db.from("client_balances").select("*");
  if (bErr) {
    toast("Error al cargar saldos");
    return;
  }

  const { data: allTx, error: tErr } = await db
    .from("transactions")
    .select("client_id, type, created_at");
  if (tErr) {
    toast("Error al cargar movimientos");
    return;
  }

  const balanceMap = Object.fromEntries(balances.map((b) => [b.client_id, b.balance]));

  // Última fecha de pago y primera fecha de deuda por cliente, para calcular recordatorios.
  const lastPaymentMap = {};
  const firstChargeMap = {};
  allTx.forEach((t) => {
    if (t.type === "pago") {
      if (!lastPaymentMap[t.client_id] || t.created_at > lastPaymentMap[t.client_id]) {
        lastPaymentMap[t.client_id] = t.created_at;
      }
    } else if (t.type === "cargo") {
      if (!firstChargeMap[t.client_id] || t.created_at < firstChargeMap[t.client_id]) {
        firstChargeMap[t.client_id] = t.created_at;
      }
    }
  });

  const now = Date.now();
  clients = clientRows.map((c) => {
    const balance = balanceMap[c.id] || 0;
    const referenceDate = lastPaymentMap[c.id] || firstChargeMap[c.id] || c.created_at;
    const daysSincePayment = Math.floor((now - new Date(referenceDate).getTime()) / 86400000);
    const overdue = balance > 0 && daysSincePayment >= OVERDUE_DAYS;
    return { ...c, balance, daysSincePayment, overdue };
  });

  renderClients();
  checkOverdueReminders();
}

function renderClients(filter = "") {
  const list = $("client-list");
  list.innerHTML = "";

  const f = filter.trim().toLowerCase();
  let filtered = f
    ? clients.filter((c) => c.name.toLowerCase().includes(f) || (c.phone || "").includes(f))
    : clients;

  if (showOnlyOverdue) filtered = filtered.filter((c) => c.overdue);

  $("clients-empty").hidden = clients.length !== 0;

  const total = clients.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  $("total-debt").textContent = money(total);

  filtered.forEach((c) => {
    const li = document.createElement("li");
    li.className = "list-item";
    const balClass = Number(c.balance) > 0 ? "pos" : "zero";
    const overdueBadge = c.overdue
      ? `<div class="badge-overdue">⚠ ${c.daysSincePayment} días sin abonar</div>`
      : "";
    li.innerHTML = `
      <div>
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="phone">${escapeHtml(c.phone || "")}</div>
        ${overdueBadge}
      </div>
      <div class="balance ${balClass}">${money(c.balance)}</div>
    `;
    li.classList.toggle("selected", c.id === currentClientId);
    li.addEventListener("click", () => {
      document.querySelectorAll(".list-item.selected").forEach((el) => el.classList.remove("selected"));
      li.classList.add("selected");
      openClientDetail(c.id);
    });
    list.appendChild(li);
  });
}

$("client-search").addEventListener("input", (e) => renderClients(e.target.value));

// ===== Recordatorios de cobro =====
function renderOverdueAlert() {
  const el = $("overdue-alert");
  const overdueClients = clients.filter((c) => c.overdue);

  if (overdueClients.length === 0) {
    el.hidden = true;
    showOnlyOverdue = false;
    return;
  }

  el.hidden = false;
  el.classList.toggle("active", showOnlyOverdue);
  const label = overdueClients.length === 1 ? "cliente lleva" : "clientes llevan";
  el.textContent = showOnlyOverdue
    ? "Mostrando solo atrasados · toca para ver todos"
    : `⚠ ${overdueClients.length} ${label} más de ${OVERDUE_DAYS} días sin abonar`;
}

$("overdue-alert").addEventListener("click", () => {
  showOnlyOverdue = !showOnlyOverdue;
  renderOverdueAlert();
  renderClients($("client-search").value);
});

function checkOverdueReminders() {
  renderOverdueAlert();

  const overdueCount = clients.filter((c) => c.overdue).length;
  if (overdueCount === 0) return;
  if (localStorage.getItem("notificationsEnabled") !== "1") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const today = todayIso();
  if (localStorage.getItem("lastReminderNotifiedDate") === today) return;

  new Notification("Recordatorio de cobros", {
    body: `${overdueCount} cliente(s) llevan más de ${OVERDUE_DAYS} días sin abonar.`,
  });
  localStorage.setItem("lastReminderNotifiedDate", today);
}

$("btn-notify").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    toast("Tu navegador no soporta notificaciones");
    return;
  }
  if (localStorage.getItem("notificationsEnabled") === "1" && Notification.permission === "granted") {
    localStorage.removeItem("notificationsEnabled");
    $("btn-notify").classList.remove("active");
    toast("Recordatorios desactivados");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    localStorage.setItem("notificationsEnabled", "1");
    localStorage.removeItem("lastReminderNotifiedDate");
    $("btn-notify").classList.add("active");
    toast("Recordatorios activados");
    checkOverdueReminders();
  } else {
    toast("Permiso de notificaciones denegado");
  }
});

if (
  "Notification" in window &&
  Notification.permission === "granted" &&
  localStorage.getItem("notificationsEnabled") === "1"
) {
  $("btn-notify").classList.add("active");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===== Add / edit client =====
$("btn-add-client").addEventListener("click", () => {
  openModal(
    "Nuevo cliente",
    `
    <label>Nombre
      <input type="text" id="f-name" required />
    </label>
    <label>Teléfono
      <input type="tel" id="f-phone" />
    </label>
    <label>Notas
      <input type="text" id="f-notes" />
    </label>
    <button class="btn btn-primary btn-block" id="f-save">Guardar cliente</button>
  `
  );
  $("f-save").addEventListener("click", async () => {
    const name = $("f-name").value.trim();
    if (!name) return toast("El nombre es obligatorio");
    const phone = $("f-phone").value.trim();
    const notes = $("f-notes").value.trim();

    const { error } = await db.from("clients").insert({ name, phone, notes });
    if (error) return toast("No se pudo guardar el cliente");
    closeModal();
    toast("Cliente agregado");
    await loadClients();
  });
});

$("btn-edit-client").addEventListener("click", () => {
  const c = clients.find((x) => x.id === currentClientId);
  if (!c) return;
  openModal(
    "Editar cliente",
    `
    <label>Nombre
      <input type="text" id="f-name" value="${escapeHtml(c.name)}" required />
    </label>
    <label>Teléfono
      <input type="tel" id="f-phone" value="${escapeHtml(c.phone || "")}" />
    </label>
    <label>Notas
      <input type="text" id="f-notes" value="${escapeHtml(c.notes || "")}" />
    </label>
    <label>Límite de crédito (opcional)
      <input type="number" id="f-limit" step="0.01" value="${c.credit_limit ?? ""}" />
    </label>
    <button class="btn btn-primary btn-block" id="f-save">Guardar cambios</button>
    <button class="btn btn-danger btn-block" id="f-delete">Eliminar cliente</button>
  `
  );

  $("f-save").addEventListener("click", async () => {
    const name = $("f-name").value.trim();
    if (!name) return toast("El nombre es obligatorio");
    const phone = $("f-phone").value.trim();
    const notes = $("f-notes").value.trim();
    const limitVal = $("f-limit").value;
    const credit_limit = limitVal === "" ? null : Number(limitVal);

    const { error } = await db
      .from("clients")
      .update({ name, phone, notes, credit_limit })
      .eq("id", c.id);
    if (error) return toast("No se pudo actualizar");
    closeModal();
    toast("Cliente actualizado");
    await loadClients();
    await openClientDetail(c.id);
  });

  $("f-delete").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar a ${c.name} y todo su historial? Esta acción no se puede deshacer.`)) return;
    const { error } = await db.from("clients").delete().eq("id", c.id);
    if (error) return toast("No se pudo eliminar");
    closeModal();
    toast("Cliente eliminado");
    resetDetailPanel();
    await loadClients();
    showView("view-clients");
  });
});

// ===== Client detail =====
async function openClientDetail(id) {
  currentClientId = id;
  const c = clients.find((x) => x.id === id);
  if (!c) return;

  $("detail-name").textContent = c.name;
  $("detail-phone").textContent = c.phone || "";
  const balEl = $("detail-balance");
  balEl.textContent = money(c.balance);
  balEl.classList.toggle("zero", Number(c.balance) <= 0);

  const limitEl = $("detail-limit");
  if (c.credit_limit != null) {
    limitEl.hidden = false;
    limitEl.textContent = `Límite de crédito: ${money(c.credit_limit)}`;
  } else {
    limitEl.hidden = true;
  }

  const overdueEl = $("detail-overdue");
  if (c.overdue) {
    overdueEl.hidden = false;
    overdueEl.textContent = `⚠ ${c.daysSincePayment} días sin abonar`;
  } else {
    overdueEl.hidden = true;
  }

  $("detail-empty").hidden = true;
  $("detail-content").hidden = false;
  $("btn-edit-client").hidden = false;

  showView("view-client-detail");
  await loadTransactions(id);
}

function resetDetailPanel() {
  currentClientId = null;
  $("detail-name").textContent = "Detalle del cliente";
  $("detail-empty").hidden = false;
  $("detail-content").hidden = true;
  $("btn-edit-client").hidden = true;
}

$("btn-back").addEventListener("click", () => {
  showView("view-clients");
  loadClients();
});

async function loadTransactions(clientId) {
  const { data, error } = await db
    .from("transactions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    toast("Error al cargar movimientos");
    return;
  }
  currentClientTx = data;
  renderTransactions();
}

function renderTransactions() {
  const list = $("transaction-list");
  list.innerHTML = "";
  $("transactions-empty").hidden = currentClientTx.length !== 0;

  currentClientTx.forEach((t) => {
    const li = document.createElement("li");
    li.className = "tx-item";
    const date = new Date(t.created_at).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const sign = t.type === "pago" ? "-" : "+";
    li.innerHTML = `
      <div class="tx-info">
        <div>${date}</div>
        <div class="tx-type">${t.type === "pago" ? "Pago" : "Deuda nueva"}</div>
        ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ""}
      </div>
      <div class="tx-amount ${t.type}">${sign}${money(t.amount)}</div>
    `;
    list.appendChild(li);
  });
}

function todayIso() {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffsetMs).toISOString().slice(0, 10);
}

function openTxModal(type) {
  const title = type === "pago" ? "Registrar pago" : "Registrar deuda nueva";
  openModal(
    title,
    `
    <label>Monto
      <input type="number" id="f-amount" step="0.01" min="0.01" inputmode="decimal" required />
    </label>
    <label>Fecha
      <input type="date" id="f-date" value="${todayIso()}" required />
    </label>
    <label>Nota (opcional)
      <input type="text" id="f-note" />
    </label>
    <button class="btn ${type === "pago" ? "btn-success" : "btn-danger"} btn-block" id="f-save">Guardar</button>
  `
  );

  $("f-amount").focus();

  $("f-save").addEventListener("click", async () => {
    const amount = Number($("f-amount").value);
    if (!amount || amount <= 0) return toast("Ingresa un monto válido");
    const dateVal = $("f-date").value;
    if (!dateVal) return toast("Ingresa una fecha");
    const note = $("f-note").value.trim();

    const timePart = new Date().toTimeString().slice(0, 8);
    const created_at = new Date(`${dateVal}T${timePart}`).toISOString();

    const { error } = await db.from("transactions").insert({
      client_id: currentClientId,
      type,
      amount,
      note: note || null,
      created_at,
    });
    if (error) return toast("No se pudo registrar el movimiento");
    closeModal();
    toast(type === "pago" ? "Pago registrado" : "Deuda registrada");
    await loadClients();
    await openClientDetail(currentClientId);
  });
}

$("btn-add-payment").addEventListener("click", () => openTxModal("pago"));
$("btn-add-charge").addEventListener("click", () => openTxModal("cargo"));

// ===== Init =====
resetDetailPanel();
showView("view-clients");
loadClients();
