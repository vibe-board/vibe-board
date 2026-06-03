import { create } from 'zustand';

interface TabNotificationState {
  notifications: Record<string, boolean>;
  markNotification(tabId: string): void;
  clearNotification(tabId: string): void;
  clearAll(): void;
}

export const useTabNotificationStore = create<TabNotificationState>((set) => ({
  notifications: {},
  markNotification(tabId) {
    set((s) => ({ notifications: { ...s.notifications, [tabId]: true } }));
  },
  clearNotification(tabId) {
    set((s) => {
      const { [tabId]: _, ...rest } = s.notifications;
      return { notifications: rest };
    });
  },
  clearAll() {
    set({ notifications: {} });
  },
}));
