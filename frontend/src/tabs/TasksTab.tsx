import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import type { BackgroundTask } from '../types/index.js';
import { Clock, RefreshCw, Terminal } from 'lucide-react';

export const TasksTab: React.FC = () => {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<BackgroundTask | null>(null);

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks');
      if (res.data.success) {
        setTasks(res.data.tasks || []);
        if (!selectedTask && res.data.tasks?.length > 0) {
          setSelectedTask(res.data.tasks[0]);
        }
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchTasks();
    const timer = setInterval(fetchTasks, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <Clock className="h-4 w-4" />
              Tiến Trình Ngầm & Nhật Ký Thời Gian Thực
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Quản Lý Tiến Trình Tác Vụ</h2>
            <p className="mt-1 text-xs text-gray-400">
              Theo dõi tiến trình tự động mua domain, deploy Pages, cào dữ liệu và phân tích log chi tiết.
            </p>
          </div>

          <button
            onClick={fetchTasks}
            className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-[#161d31] px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-4 space-y-2 overflow-y-auto max-h-[500px]">
          <h3 className="text-xs font-bold text-gray-400 uppercase px-2 mb-3">Danh Sách Tiến Trình</h3>
          {tasks.length === 0 ? (
            <div className="text-center py-10 text-xs text-gray-500">Chưa có tiến trình ngầm nào</div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTask(t)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedTask?.id === t.id
                    ? 'border-cyan-500 bg-cyan-500/10 text-white'
                    : 'border-gray-800/80 bg-[#161d31]/50 text-gray-300 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">{t.type}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      t.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : t.status === 'failed'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-cyan-500/20 text-cyan-300 animate-pulse'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-gray-400 truncate">{t.message}</p>
              </div>
            ))
          )}
        </div>

        {/* Task Log Details */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              Chi Tiết Nhật Ký: {selectedTask?.id || 'Chưa chọn'}
            </h3>
            {selectedTask && (
              <span className="text-xs font-mono text-gray-400">
                {new Date(selectedTask.createdAt).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </div>

          <div className="rounded-xl bg-[#090d16] p-4 font-mono text-xs text-cyan-300 min-h-[350px] max-h-[400px] overflow-y-auto space-y-1">
            {selectedTask?.logs && selectedTask.logs.length > 0 ? (
              selectedTask.logs.map((log, idx) => <div key={idx}>{log}</div>)
            ) : (
              <div className="text-gray-500">Chọn một tiến trình để xem nhật ký trực tiếp.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
