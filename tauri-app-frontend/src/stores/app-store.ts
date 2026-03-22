import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project, TaskWithAttemptStatus, Workspace, Notification } from '@/types';

interface AppState {
  // Navigation
  currentView: 'dashboard' | 'projects' | 'project-detail' | 'tasks' | 'task-detail' | 'settings' | 'servers';
  selectedProjectId: string | null;
  selectedTaskId: string | null;

  // Data
  projects: Project[];
  tasks: TaskWithAttemptStatus[];
  workspaces: Record<string, Workspace[]>; // taskId -> workspaces

  // UI
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  notifications: Notification[];

  // Loading
  loading: {
    projects: boolean;
    tasks: boolean;
  };
}

interface AppActions {
  setView(view: AppState['currentView']): void;
  setSelectedProject(id: string | null): void;
  setSelectedTask(id: string | null): void;
  setProjects(projects: Project[]): void;
  setTasks(tasks: TaskWithAttemptStatus[]): void;
  setWorkspaces(taskId: string, workspaces: Workspace[]): void;
  toggleSidebar(): void;
  setCommandPaletteOpen(open: boolean): void;
  addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void;
  dismissNotification(id: string): void;
  setLoading(key: keyof AppState['loading'], value: boolean): void;
}

export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    currentView: 'dashboard',
    selectedProjectId: null,
    selectedTaskId: null,
    projects: [],
    tasks: [],
    workspaces: {},
    sidebarCollapsed: false,
    commandPaletteOpen: false,
    notifications: [],
    loading: {
      projects: false,
      tasks: false,
    },

    setView(view) {
      set({ currentView: view });
    },

    setSelectedProject(id) {
      set({ selectedProjectId: id });
    },

    setSelectedTask(id) {
      set({ selectedTaskId: id });
    },

    setProjects(projects) {
      set({ projects });
    },

    setTasks(tasks) {
      set({ tasks });
    },

    setWorkspaces(taskId, workspaces) {
      set((state) => {
        state.workspaces[taskId] = workspaces;
      });
    },

    toggleSidebar() {
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      });
    },

    setCommandPaletteOpen(open) {
      set({ commandPaletteOpen: open });
    },

    addNotification(notification) {
      set((state) => {
        state.notifications.unshift({
          ...notification,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        });
        if (state.notifications.length > 20) {
          state.notifications = state.notifications.slice(0, 20);
        }
      });
    },

    dismissNotification(id) {
      set((state) => {
        state.notifications = state.notifications.filter((n) => n.id !== id);
      });
    },

    setLoading(key, value) {
      set((state) => {
        state.loading[key] = value;
      });
    },
  })),
);
