import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory tasks store
const tasksMap = new Map();
const taskListeners = new Map(); // taskId -> Set of listener functions

function loadTasks() {
  if (fs.existsSync(TASKS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
      if (Array.isArray(data)) {
        for (const t of data) {
          tasksMap.set(t.id, t);
        }
      }
    } catch (e) {
      console.error("[TaskQueue] Error loading tasks.json:", e.message);
    }
  }
}

function saveTasks() {
  try {
    const list = Array.from(tasksMap.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100); // Keep last 100 tasks
    fs.writeFileSync(TASKS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.error("[TaskQueue] Error saving tasks.json:", e.message);
  }
}

loadTasks();

export function createTask({ type, domain = "", userId = "admin", params = {}, title = "" }) {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const task = {
    id,
    type,
    title: title || `${type} ${domain}`.trim(),
    domain,
    userId,
    params,
    status: "PENDING",
    progress: 0,
    currentStep: "Khởi tạo tác vụ...",
    steps: [
      {
        time: new Date().toISOString(),
        message: "Tác vụ đã được thêm vào hàng đợi xử lý ngầm",
        status: "info",
      },
    ],
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };

  tasksMap.set(id, task);
  saveTasks();
  notifyTaskUpdate(id);
  return task;
}

export function updateTaskProgress(id, progress, currentStep, stepMessage = null, stepStatus = "info") {
  const task = tasksMap.get(id);
  if (!task) return null;

  if (task.status === "PENDING") {
    task.status = "RUNNING";
    task.startedAt = new Date().toISOString();
  }

  task.progress = Math.min(100, Math.max(0, progress));
  if (currentStep) task.currentStep = currentStep;

  if (stepMessage) {
    task.steps.push({
      time: new Date().toISOString(),
      message: stepMessage,
      status: stepStatus,
    });
  }

  saveTasks();
  notifyTaskUpdate(id);
  return task;
}

export function completeTask(id, result = {}, finishMessage = "Hoàn tất thành công") {
  const task = tasksMap.get(id);
  if (!task) return null;

  task.status = "SUCCESS";
  task.progress = 100;
  task.currentStep = finishMessage;
  task.result = result;
  task.finishedAt = new Date().toISOString();
  task.steps.push({
    time: new Date().toISOString(),
    message: finishMessage,
    status: "success",
  });

  saveTasks();
  notifyTaskUpdate(id);
  return task;
}

export function failTask(id, error, failMessage = "Tác vụ thất bại") {
  const task = tasksMap.get(id);
  if (!task) return null;

  const errMsg = typeof error === "string" ? error : error?.message || "Lỗi không xác định";
  task.status = "FAILED";
  task.currentStep = failMessage;
  task.error = errMsg;
  task.finishedAt = new Date().toISOString();
  task.steps.push({
    time: new Date().toISOString(),
    message: `❌ ${failMessage}: ${errMsg}`,
    status: "error",
  });

  saveTasks();
  notifyTaskUpdate(id);
  return task;
}

export function getTask(id) {
  return tasksMap.get(id) || null;
}

export function listTasks({ userId = null, limit = 50 } = {}) {
  let list = Array.from(tasksMap.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  if (userId && userId !== "admin") {
    list = list.filter((t) => t.userId === userId);
  }
  return list.slice(0, limit);
}

export function subscribeTask(taskId, callback) {
  if (!taskListeners.has(taskId)) {
    taskListeners.set(taskId, new Set());
  }
  taskListeners.get(taskId).add(callback);

  return () => {
    const set = taskListeners.get(taskId);
    if (set) {
      set.delete(callback);
      if (set.size === 0) taskListeners.delete(taskId);
    }
  };
}

function notifyTaskUpdate(taskId) {
  const task = tasksMap.get(taskId);
  if (!task) return;
  const set = taskListeners.get(taskId);
  if (set) {
    for (const cb of set) {
      try {
        cb(task);
      } catch (e) {
        console.error(`[TaskQueue] Listener error for ${taskId}:`, e.message);
      }
    }
  }
}
