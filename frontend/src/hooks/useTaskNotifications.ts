import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskStatus, Task, ApprovalInfo } from 'shared/types';
import type { Config } from 'shared/types';

const STORAGE_KEY = 'notification-prompt-dismissed';

/**
 * Check if browser notifications are supported and return current permission status.
 */
export function getNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * Frontend-based notification hook that watches for task status changes
 * and new approval requests, then triggers browser notifications and sounds.
 *
 * This replaces backend OS-level notifications which don't work over SSH tunnels.
 */
export function useTaskNotifications(
  tasksById: Record<string, Task>,
  pendingApprovals: ApprovalInfo[],
  config: Config | null
) {
  const prevTasksRef = useRef<Record<string, TaskStatus>>({});
  const prevApprovalIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermission());
  const [, setPromptDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const pushEnabled = config?.notifications.push_enabled;
  const soundEnabled = config?.notifications.sound_enabled;
  const soundFile = config?.notifications.sound_file;

  // Don't auto-prompt for notifications — users configure this in Settings.
  // Push notifications are only needed for E2EE and remote connection scenarios.
  const showNotificationPrompt = false;

  const triggerNotification = useCallback(
    (title: string, body: string) => {
      // Browser push notification
      if (
        pushEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification(title, { body, requireInteraction: true });
      }

      // Sound notification
      if (soundEnabled && soundFile) {
        const audio = new Audio(`/api/sounds/${soundFile}`);
        audio.play().catch(console.error);
      }
    },
    [pushEnabled, soundEnabled, soundFile]
  );

  // Request notification permission (must be called from user gesture)
  const enableNotifications = useCallback(() => {
    if (typeof Notification === 'undefined' || !window.isSecureContext) return;
    setPromptDismissed(false);
    localStorage.removeItem(STORAGE_KEY);
    Notification.requestPermission().then((permission) => {
      setNotificationPermission(permission);
    });
  }, []);

  // Dismiss the prompt (don't show again until user re-enables in settings)
  const dismissNotificationPrompt = useCallback(() => {
    setPromptDismissed(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  // Reset dismissed state (for settings panel)
  const resetNotificationPrompt = useCallback(() => {
    setPromptDismissed(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Watch task status changes
  useEffect(() => {
    if (!initializedRef.current) {
      Object.entries(tasksById).forEach(([id, task]) => {
        prevTasksRef.current[id] = task.status;
      });
      initializedRef.current = true;
      return;
    }

    Object.entries(tasksById).forEach(([id, task]) => {
      const prevStatus = prevTasksRef.current[id];
      if (prevStatus && prevStatus !== task.status) {
        const agent =
          task.executor + (task.variant ? ` (${task.variant})` : '');
        if (task.status === 'inreview') {
          triggerNotification('Review Needed', `${task.title}\n${agent}`);
        }
      }
      prevTasksRef.current[id] = task.status;
    });

    const currentIds = new Set(Object.keys(tasksById));
    Object.keys(prevTasksRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        delete prevTasksRef.current[id];
      }
    });
  }, [tasksById, triggerNotification]);

  // Watch new approval requests
  useEffect(() => {
    const currentIds = new Set(pendingApprovals.map((a) => a.approval_id));
    pendingApprovals.forEach((approval) => {
      if (!prevApprovalIdsRef.current.has(approval.approval_id)) {
        const title = approval.is_question
          ? 'Question Asked'
          : 'Approval Needed';
        triggerNotification(title, approval.tool_name);
      }
    });
    prevApprovalIdsRef.current = currentIds;
  }, [pendingApprovals, triggerNotification]);

  return {
    showNotificationPrompt,
    notificationPermission,
    enableNotifications,
    dismissNotificationPrompt,
    resetNotificationPrompt,
  };
}
