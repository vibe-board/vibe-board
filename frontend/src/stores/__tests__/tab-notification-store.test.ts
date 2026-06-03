import { describe, it, expect, beforeEach } from 'vitest';
import { useTabNotificationStore } from '../tab-notification-store';

describe('tabNotificationStore', () => {
  beforeEach(() => {
    useTabNotificationStore.getState().clearAll();
  });

  it('starts with empty notifications', () => {
    const { notifications } = useTabNotificationStore.getState();
    expect(notifications).toEqual({});
  });

  it('markNotification adds a tab entry', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({
      'tab-1': true,
    });
  });

  it('markNotification is idempotent', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({
      'tab-1': true,
    });
  });

  it('clearNotification removes a specific tab entry', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-2');
    useTabNotificationStore.getState().clearNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({
      'tab-2': true,
    });
  });

  it('clearNotification is safe for non-existent tab', () => {
    useTabNotificationStore.getState().clearNotification('nonexistent');
    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });

  it('clearAll removes all entries', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-2');
    useTabNotificationStore.getState().clearAll();
    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });
});
