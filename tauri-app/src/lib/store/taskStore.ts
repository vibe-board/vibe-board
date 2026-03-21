import { create } from 'zustand';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  project_id: string;
  assignee?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

interface TaskState {
  tasks: Task[];
  currentTaskId: string | null;
  filterStatus: TaskStatus | 'all';
  isLoading: boolean;

  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  setCurrentTask: (id: string | null) => void;
  setFilterStatus: (status: TaskStatus | 'all') => void;
  setLoading: (loading: boolean) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  currentTaskId: null,
  filterStatus: 'all',
  isLoading: false,

  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      currentTaskId: state.currentTaskId === id ? null : state.currentTaskId,
    })),
  setCurrentTask: (id) => set({ currentTaskId: id }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
