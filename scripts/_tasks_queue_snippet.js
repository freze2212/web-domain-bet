// ── 9. TASK QUEUE CONTROLLER & REAL-TIME POLLING ───────────────────────────
let allTasks = [];
let hubOrdersCache = [];
let hubOptimisticTasks = new Map();
let taskPollingInterval = null;
const TASK_POLL_FAST_MS = 1200;
const TASK_POLL_SLOW_MS = 4000;
let tasksQueuePage = 1;
const TASKS_PAGE_SIZE = 8;
let tasksQueueFilter = "active"; // active | done | all

function isTaskRunningStatus(s) {
  return s === "RUNNING" || s === "PENDING";
}
function isTaskTerminalStatus(s) {
  return s === "SUCCESS" || s === "FAILED" || s === "CANCELLED";
}
function domainKeyOf(t) {
  return String(t?.domain || t?.id || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

function pushOptimisticHubTask({ domain, title, label }) {
  const key = String(domain || "").toLowerCase();
  if (!key) return;
  hubOptimisticTasks.set(key, {
    id: `opt_${Date.now()}`,
    title: title || label || `Đang xử lý — ${domain}`,
    domain,
    status: "RUNNING",
    progress: 5,
    currentStep: label || "Đang gửi yêu cầu lên server...",
    steps: [{ time: new Date().toISOString(), message: label || "Đang gửi yêu cầu lên server...", status: "info" }],
    createdAt: new Date().toISOString(),
    _optimistic: true,
  });
  tasksQueuePage = 1;
  tasksQueueFilter = "active";
  renderTasks();
  updateTaskBadge();
}

function mergeHubTaskFromApi(task) {
  if (!task?.id) return;
  const key = String(task.domain || "").toLowerCase();
  if (key) hubOptimisticTasks.delete(key);
  const idx = allTasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) allTasks[idx] = task;
  else allTasks.unshift(task);
  renderTasks();
  updateTaskBadge();
}

function syncOptimisticTasksFromServer(tasks) {
  const serverDomains = new Set((tasks || []).map((t) => String(t.domain || "").toLowerCase()).filter(Boolean));
  for (const key of hubOptimisticTasks.keys()) {
    if (serverDomains.has(key)) hubOptimisticTasks.delete(key);
  }
  const now = Date.now();
  for (const [key, t] of hubOptimisticTasks.entries()) {
    const age = now - new Date(t.createdAt || 0).getTime();
    if (age > 3 * 60 * 1000) hubOptimisticTasks.delete(key);
  }
}

function rescheduleTaskPolling() {
  const running = getDisplayTasks().filter((t) => isTaskRunningStatus(t.status)).length;
  const ms = running > 0 ? TASK_POLL_FAST_MS : TASK_POLL_SLOW_MS;
  if (taskPollingInterval) clearInterval(taskPollingInterval);
  taskPollingInterval = setInterval(() => {
    loadTasksList();
  }, ms);
}

async function loadTasksList() {
  try {
    await fetchHistorySilent().catch(() => {});
    const [tasksRes, ordersRes] = await Promise.all([
      fetch("/api/tasks", { headers: authHeaders() }),
      fetch("/api/domain-orders", { headers: authHeaders() }).catch(() => null),
    ]);
    const data = await tasksRes.json();
    if (data.success) {
      allTasks = data.tasks || [];
      syncOptimisticTasksFromServer(allTasks);
    }
    if (ordersRes?.ok) {
      const ordersData = await ordersRes.json();
      hubOrdersCache = ordersData.success && Array.isArray(ordersData.orders) ? ordersData.orders : [];
    }
    renderTasks();
    updateTaskBadge();
    rescheduleTaskPolling();
  } catch {}
}

function getPendingOrdersAsTasks() {
  return (hubOrdersCache || [])
    .filter((o) => o.status === "pending" || (o.status === "approved" && !o.fulfilledAt))
    .map((o) => ({
      id: o.id,
      title:
        o.status === "pending"
          ? `🛒 Đặt mua — ${o.domain}`
          : `⚙️ Admin đang cài — ${o.domain}`,
      domain: o.domain,
      status: o.status === "pending" ? "PENDING" : "RUNNING",
      progress: o.status === "pending" ? 20 : 60,
      currentStep:
        o.status === "pending"
          ? `Chờ duyệt • ${(o.priceXu || 0).toLocaleString("vi-VN")} Xu`
          : "Admin đã duyệt — đang mua & cài đặt",
      steps: [
        {
          time: o.createdAt || new Date().toISOString(),
          message:
            o.status === "pending"
              ? `Chờ duyệt • ${(o.priceXu || 0).toLocaleString("vi-VN")} Xu`
              : "Admin đã duyệt — đang mua & cài đặt",
          status: "info",
        },
      ],
      createdAt: o.createdAt || new Date().toISOString(),
      userId: o.userId,
      username: o.username,
      _fromOrder: true,
    }));
}

function getHistoryProgressAsTasks() {
  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const terminalDomains = new Set(
    allTasks
      .filter((t) => isTaskTerminalStatus(t.status))
      .map((t) => domainKeyOf(t))
      .filter(Boolean)
  );
  const now = Date.now();
  return (allHistory || [])
    .filter((h) => {
      if (h.status !== "in_progress" && h.status !== "pending") return false;
      if (h.taskId && tasksById.has(h.taskId)) {
        const t = tasksById.get(h.taskId);
        if (isTaskTerminalStatus(t.status) || isTaskRunningStatus(t.status)) return false;
      }
      const key = String(h.domain || "")
        .toLowerCase()
        .replace(/^www\./, "");
      if (key && terminalDomains.has(key)) {
        const term = allTasks.find((t) => domainKeyOf(t) === key && isTaskTerminalStatus(t.status));
        const termTs = term?.finishedAt ? new Date(term.finishedAt).getTime() : 0;
        const histTs = new Date(h.updatedAt || h.timestamp || 0).getTime();
        if (termTs && termTs >= histTs) return false;
      }
      const age = now - new Date(h.updatedAt || h.timestamp || 0).getTime();
      if (age > 2 * 60 * 60 * 1000) return false;
      return true;
    })
    .map((h) => ({
      id: h.taskId || h.id,
      title: `${h.actionLabel || "Đang xử lý"} — ${h.domain}`,
      domain: h.domain,
      status: "RUNNING",
      progress: typeof h.progressPct === "number" ? h.progressPct : 45,
      currentStep: h.progress || h.details?.step || "Đang xử lý trên server...",
      steps: [
        {
          time: h.timestamp || new Date().toISOString(),
          message: h.progress || h.details?.step || "Đang xử lý trên server...",
          status: "info",
        },
      ],
      createdAt: h.timestamp || new Date().toISOString(),
      userId: h.userId,
      username: h.username || h.fullName,
      _fromHistory: true,
    }));
}

function getDisplayTasks() {
  const merged = new Map();

  const beats = (next, prev) => {
    if (!prev) return true;
    if (next._fromHistory && !prev._fromHistory && isTaskTerminalStatus(prev.status)) return false;
    if (!next._fromHistory && prev._fromHistory && isTaskTerminalStatus(next.status)) return true;
    if (!next._fromHistory && prev._fromHistory && isTaskRunningStatus(next.status)) return true;
    if (next._fromHistory && !prev._fromHistory && isTaskRunningStatus(prev.status)) return false;
    if (isTaskTerminalStatus(next.status) && isTaskRunningStatus(prev.status) && prev._fromHistory) return true;
    if (isTaskRunningStatus(next.status) && next._fromHistory && isTaskTerminalStatus(prev.status)) return false;
    return (next._pri || 0) > (prev._pri || 0);
  };

  const add = (t, pri) => {
    const key = domainKeyOf(t);
    if (!key) return;
    const row = { ...t, _pri: pri };
    const prev = merged.get(key);
    if (beats(row, prev)) merged.set(key, row);
  };

  for (const t of hubOptimisticTasks.values()) add(t, 60);
  allTasks.filter((t) => isTaskRunningStatus(t.status)).forEach((t) => add(t, 50));
  getHistoryProgressAsTasks().forEach((t) => add(t, 35));
  getPendingOrdersAsTasks().forEach((t) => add(t, 30));

  allTasks
    .filter((t) => isTaskTerminalStatus(t.status))
    .forEach((t) => {
      const fin = t.finishedAt ? new Date(t.finishedAt).getTime() : 0;
      const keepMs = t.status === "FAILED" ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000;
      if (fin && Date.now() - fin < keepMs) add(t, 25);
    });

  const trackedDomains = new Set([...merged.keys()]);
  for (const h of allHistory || []) {
    if (h.status !== "failed" || !h.domain) continue;
    const key = String(h.domain).toLowerCase().replace(/^www\./, "");
    if (trackedDomains.has(key)) continue;
    const ts = h.updatedAt || h.timestamp;
    const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    if (age > 6 * 60 * 60 * 1000) continue;
    add(
      {
        id: h.taskId || h.id,
        title: `${h.actionLabel || "Thất bại"} — ${h.domain}`,
        domain: h.domain,
        status: "FAILED",
        progress: 100,
        currentStep: h.error || "Cài đặt thất bại",
        steps: [
          {
            time: ts || new Date().toISOString(),
            message: h.error || "Cài đặt thất bại",
            status: "error",
          },
        ],
        createdAt: h.timestamp || new Date().toISOString(),
        finishedAt: ts || new Date().toISOString(),
        error: h.error,
        _fromHistory: true,
      },
      20
    );
  }

  return Array.from(merged.values())
    .sort((a, b) => {
      const ar = isTaskRunningStatus(a.status) ? 1 : 0;
      const br = isTaskRunningStatus(b.status) ? 1 : 0;
      if (br !== ar) return br - ar;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .map(({ _pri, ...t }) => t);
}

function getFilteredDisplayTasks() {
  const all = getDisplayTasks();
  if (tasksQueueFilter === "active") return all.filter((t) => isTaskRunningStatus(t.status));
  if (tasksQueueFilter === "done") return all.filter((t) => isTaskTerminalStatus(t.status));
  return all;
}

function setTasksQueueFilter(filter) {
  tasksQueueFilter = filter === "done" || filter === "all" ? filter : "active";
  tasksQueuePage = 1;
  renderTasks();
  updateTaskBadge();
}

function updateTaskBadge() {
  const badge = document.getElementById("badgeTasksCount");
  const headerCount = document.getElementById("headerTaskCount");
  const running = getDisplayTasks().filter((t) => isTaskRunningStatus(t.status)).length;

  if (badge) {
    badge.textContent = running;
    badge.style.display = running > 0 ? "inline-block" : "none";
  }

  if (headerCount) {
    headerCount.textContent = running > 0 ? `${running} đang chạy` : "0 đang chạy";
    headerCount.style.color = running > 0 ? "var(--accent-amber)" : "var(--text-muted)";
  }

  const mark = (id, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.outline = on ? "2px solid var(--accent-cyan)" : "";
    el.style.opacity = on ? "1" : "0.75";
  };
  mark("tasksFilterActive", tasksQueueFilter === "active");
  mark("tasksFilterDone", tasksQueueFilter === "done");
  mark("tasksFilterAll", tasksQueueFilter === "all");
}

function renderTasks() {
  const container = document.getElementById("tasksListContainer");
  if (!container) return;

  const filtered = getFilteredDisplayTasks();
  const totalPages = Math.max(1, Math.ceil(filtered.length / TASKS_PAGE_SIZE));
  if (tasksQueuePage > totalPages) tasksQueuePage = totalPages;
  const start = (tasksQueuePage - 1) * TASKS_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + TASKS_PAGE_SIZE);

  if (typeof renderPaginationBar === "function") {
    renderPaginationBar(document.getElementById("tasksPagination"), {
      page: tasksQueuePage,
      totalPages,
      total: filtered.length,
      limit: TASKS_PAGE_SIZE,
      onPage: (p) => {
        tasksQueuePage = p;
        renderTasks();
      },
      label: "tiến trình",
    });
  }

  if (filtered.length === 0) {
    const emptyMsg =
      tasksQueueFilter === "done"
        ? "Chưa có tiến trình vừa hoàn tất trong cửa sổ gần đây."
        : tasksQueueFilter === "all"
          ? "Hàng đợi trống."
          : "Không có tiến trình đang chạy.";
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center;">
        <span style="font-size: 40px;">☕</span>
        <p style="margin-top: 10px; color: var(--text-muted);">${emptyMsg}</p>
        <p style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">Mua / đổi link / đổi LP — xong chuyển sang Lịch sử.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = pageItems
    .map((t) => {
      const statusClass = String(t.status || "").toLowerCase();
      const statusLabel =
        t.status === "SUCCESS"
          ? "✅ HOÀN TẤT"
          : t.status === "FAILED"
            ? "❌ THẤT BẠI"
            : t.status === "RUNNING"
              ? "⏳ ĐANG XỬ LÝ"
              : "⏱️ CHỜ XỬ LÝ";

      const lastLog =
        t.currentStep ||
        (t.steps && t.steps.length > 0 ? t.steps[t.steps.length - 1].message : "") ||
        "…";
      const pct = Math.min(100, Math.max(0, Number(t.progress) || 0));
      const safeId = String(t.id || "").replace(/'/g, "\\'");

      return `
      <div class="task-item-card ${statusClass}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="user-role-tag ${t.status === "SUCCESS" ? "admin" : t.status === "FAILED" ? "user" : "admin"}">${statusLabel}</span>
              <strong style="font-size: 15px; color: #fff;">${t.title}</strong>
            </div>
            <span style="font-size: 12px; color: var(--text-dim); margin-top: 4px; display: inline-block;">
              ${t.domain ? `<span style="font-family: var(--font-mono); color: #fbbf24;">${t.domain}</span> • ` : ""}
              ${new Date(t.createdAt).toLocaleString("vi-VN")}
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${
              t.status === "SUCCESS" && t.result?.template?.id
                ? `<button class="btn btn-primary btn-sm" onclick="downloadTemplateZip('${t.result.template.id}')" style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); border-color: #10b981; font-weight: 700;">📥 Tải ZIP</button>`
                : ""
            }
            ${
              t.status === "FAILED"
                ? `<button class="btn btn-primary btn-sm" onclick="retryFailedDeploy('${safeId}')" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-color: #f59e0b; font-weight: 700;">🔄 Thử Lại</button>`
                : ""
            }
            <button class="btn btn-secondary btn-sm" onclick="openTaskDetail('${safeId}')" ${t._fromHistory || t._fromOrder || t._optimistic ? "disabled title='Xem tab Lịch sử nếu cần'" : ""}>📜 Nhật ký</button>
          </div>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-bar ${statusClass}" style="width: ${pct}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 6px; gap: 10px;">
          <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👉 ${lastLog}</span>
          <span style="font-weight: 700; color: #fff; flex-shrink:0;">${pct}%</span>
        </div>
      </div>`;
    })
    .join("");
}

function openTaskDetail(taskId) {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  const title = document.getElementById("taskDetailTitle");
  const sub = document.getElementById("taskDetailSubtitle");
  const pBar = document.getElementById("taskDetailProgressBar");
  const logs = document.getElementById("taskDetailLogs");

  if (title) title.textContent = task.title;
  if (sub) sub.textContent = `Trạng thái: ${task.status} (${task.progress}%) • Bắt đầu: ${new Date(task.createdAt).toLocaleTimeString()}`;
  if (pBar) {
    pBar.style.width = `${task.progress || 0}%`;
    pBar.className = `task-progress-bar ${String(task.status || "").toLowerCase()}`;
  }
  if (logs) {
    logs.innerHTML = (task.steps || [])
      .map(
        (s) => `
      <div style="margin-bottom: 6px;">
        <span style="color: var(--text-dim);">[${new Date(s.time).toLocaleTimeString()}]</span>
        <span style="color: ${s.status === "success" ? "var(--accent-emerald)" : s.status === "error" ? "var(--accent-rose)" : "var(--text-main)"};">${s.message}</span>
      </div>`
      )
      .join("");
    if (task.status === "FAILED") {
      const safeId = String(task.id || "").replace(/'/g, "\\'");
      logs.innerHTML += `
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
          <button class="btn btn-primary btn-sm" onclick="closeModal('taskDetailModal'); retryFailedDeploy('${safeId}')" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-color: #f59e0b; font-weight: 700;">
            🔄 Thử Lại Mua / Cài
          </button>
        </div>`;
    }
  }

  openModal("taskDetailModal");
}

