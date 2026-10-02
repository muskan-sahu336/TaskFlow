const form = document.getElementById("task-form");
const listEl = document.getElementById("task-list");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("form-error");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formTitle = document.getElementById("form-title");

let tasks = [];
let currentFilter = "all";
let editingId = null;

const STATUS_LABELS = { pending: "Pending", in_progress: "In progress", done: "Done" };

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/";
    return null;
  }
  const data = await res.json();
  return { ok: res.ok, data };
}

async function loadUser() {
  const res = await api("/api/me");
  if (res && res.ok) {
    document.getElementById("welcome").textContent = "Hi, " + res.data.username;
  }
}

async function loadTasks() {
  const res = await api("/api/tasks");
  if (res && res.ok) {
    tasks = res.data;
    render();
  }
}

function render() {
  listEl.innerHTML = "";
  const visible = tasks.filter((t) => currentFilter === "all" || t.status === currentFilter);
  emptyEl.classList.toggle("hidden", visible.length > 0);

  visible.forEach((task) => {
    const card = document.createElement("article");
    card.className = "task-card " + task.status;

    const title = document.createElement("h3");
    title.textContent = task.title;
    card.appendChild(title);

    if (task.description) {
      const desc = document.createElement("p");
      desc.className = "task-desc";
      desc.textContent = task.description;
      card.appendChild(desc);
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const badge = document.createElement("span");
    badge.className = "badge " + task.priority;
    badge.textContent = task.priority;
    meta.appendChild(badge);

    if (task.due_date) {
      const due = document.createElement("span");
      due.className = "due";
      due.textContent = "Due: " + task.due_date;
      meta.appendChild(due);
    }
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "actions";

    const statusSelect = document.createElement("select");
    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      opt.selected = task.status === value;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener("change", () => updateStatus(task, statusSelect.value));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-outline";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEdit(task));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteTask(task.id));

    actions.append(statusSelect, editBtn, delBtn);
    card.appendChild(actions);
    listEl.appendChild(card);
  });
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = "Add a task";
  saveBtn.textContent = "Add task";
  cancelBtn.classList.add("hidden");
  errorEl.textContent = "";
}

function startEdit(task) {
  editingId = task.id;
  document.getElementById("title").value = task.title;
  document.getElementById("description").value = task.description || "";
  document.getElementById("priority").value = task.priority;
  document.getElementById("status").value = task.status;
  document.getElementById("due_date").value = task.due_date || "";
  formTitle.textContent = "Edit task";
  saveBtn.textContent = "Update task";
  cancelBtn.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function updateStatus(task, status) {
  const body = {
    title: task.title,
    description: task.description,
    priority: task.priority,
    due_date: task.due_date,
    status,
  };
  const res = await api("/api/tasks/" + task.id, { method: "PUT", body: JSON.stringify(body) });
  if (res && res.ok) loadTasks();
}

async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  const res = await api("/api/tasks/" + id, { method: "DELETE" });
  if (res && res.ok) {
    if (editingId === id) resetForm();
    loadTasks();
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";

  const body = {
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    priority: document.getElementById("priority").value,
    status: document.getElementById("status").value,
    due_date: document.getElementById("due_date").value,
  };

  const url = editingId ? "/api/tasks/" + editingId : "/api/tasks";
  const method = editingId ? "PUT" : "POST";
  const res = await api(url, { method, body: JSON.stringify(body) });

  if (res && res.ok) {
    resetForm();
    loadTasks();
  } else if (res) {
    errorEl.textContent = res.data.error || "Something went wrong";
  }
});

cancelBtn.addEventListener("click", resetForm);

document.getElementById("filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  currentFilter = chip.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
  render();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/";
});

loadUser();
loadTasks();