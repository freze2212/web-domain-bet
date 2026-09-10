import { Injectable } from '@nestjs/common';

export interface BackgroundTask {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, BackgroundTask>();

  createTask(type: string, initialMessage = 'Khởi tạo tiến trình...'): BackgroundTask {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: BackgroundTask = {
      id,
      type,
      status: 'running',
      progress: 0,
      message: initialMessage,
      logs: [`[${new Date().toLocaleTimeString('vi-VN')}] ${initialMessage}`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, task);
    return task;
  }

  updateTask(id: string, updates: Partial<BackgroundTask>, logMessage?: string): BackgroundTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    Object.assign(task, updates);
    task.updatedAt = new Date().toISOString();
    if (logMessage) {
      task.logs.push(`[${new Date().toLocaleTimeString('vi-VN')}] ${logMessage}`);
    }
    return task;
  }

  getTask(id: string): BackgroundTask | null {
    return this.tasks.get(id) || null;
  }

  listTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).reverse().slice(0, 50);
  }
}
