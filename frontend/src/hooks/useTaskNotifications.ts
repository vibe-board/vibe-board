import { useCallback, useEffect, useRef } from 'react';
import type {
  TaskStatus,
  TaskWithAttemptStatus,
  ApprovalInfo,
} from 'shared/types';
import type { Config } from 'shared/types';

/**
 * Frontend-based notification hook that watches for task status changes
 * and new approval requests, then triggers browser notifications and sounds.
 *
 * This replaces backend OS-level notifications which don't work over SSH tunnels.
 */
export function useTaskNotifications(
  tasksById: Record<string, TaskWithAttemptStatus>,
  pendingApprovals: ApprovalInfo[],
  config: Config | null
) {
  const prevTasksRef = useRef<Record<string, TaskStatus>>({});
  const prevApprovalIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const pushEnabled = config?.notifications.push_enabled;
  const soundEnabled = config?.notifications.sound_enabled;
  const soundFile = config?.notifications.sound_file;

  const triggerNotification = useCallback(
    (title: string, body: string) => {
      // Browser push notification
      if (pushEnabled) {
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'default') {
            Notification.requestPermission().then((permission) => {
              if (permission === 'granted') {
                new Notification(title, { body });
              }
            });
          } else if (Notification.permission === 'granted') {
            new Notification(title, { body });
          }
        }
      }

      // Sound notification
      if (soundEnabled && soundFile) {
        const audio = new Audio(`/api/sounds/${soundFile}`);
        audio.play().catch(console.error);
      }
    },
    [pushEnabled, soundEnabled, soundFile]
  );

  // Watch task status changes
  useEffect(() => {
    // On first run, just populate the ref without notifying
    if (!initializedRef.current) {
      Object.entries(tasksById).forEach(([id, task]) => {
        prevTasksRef.current[id] = task.status;
      });
      initializedRef.current = true;
      return;
    }

    // Detect transitions to terminal states
    Object.entries(tasksById).forEach(([id, task]) => {
      const prevStatus = prevTasksRef.current[id];

      // Only notify on status change (not initial snapshot)
      if (prevStatus && prevStatus !== task.status) {
        if (task.status === 'done') {
          triggerNotification('Task Completed', task.title);
        } else if (task.status === 'inreview') {
          triggerNotification('Review Needed', task.title);
        }
      }

      prevTasksRef.current[id] = task.status;
    });

    // Clean up removed tasks
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

    // Find new approvals
    pendingApprovals.forEach((approval) => {
      if (!prevApprovalIdsRef.current.has(approval.approval_id)) {
        const title = approval.is_question
          ? 'Question Asked'
          : 'Approval Needed';
        const body = approval.is_question
          ? 'A question requires your answer'
          : `Tool '${approval.tool_name}' requires approval`;
        triggerNotification(title, body);
      }
    });

    prevApprovalIdsRef.current = currentIds;
  }, [pendingApprovals, triggerNotification]);
}
