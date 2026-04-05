import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  createChannel,
  Importance,
} from '@tauri-apps/plugin-notification';

const CHANNEL_ID = 'task-notifications';
let channelCreated = false;

/**
 * Request notification permission from the user.
 * Returns true if granted.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const granted = await isPermissionGranted();
  if (granted) return true;

  const result = await requestPermission();
  return result === 'granted';
}

/**
 * Ensure the Android notification channel exists.
 * No-op on iOS (channels aren't used).
 */
async function ensureChannel(): Promise<void> {
  if (channelCreated) return;
  try {
    await createChannel({
      id: CHANNEL_ID,
      name: 'Task Notifications',
      importance: Importance.Default,
    });
    channelCreated = true;
  } catch {
    // Channel creation may fail on iOS — that's fine
  }
}

/**
 * Send a notification (fire-and-forget).
 */
export async function notify(title: string, body?: string): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await ensureChannel();
  sendNotification({
    title,
    body,
    channelId: CHANNEL_ID,
    autoCancel: true,
  });
}

/**
 * Convenience: notify that a task completed or failed.
 */
export async function notifyTaskComplete(
  taskTitle: string,
  success: boolean,
): Promise<void> {
  if (success) {
    await notify('Task Complete', taskTitle);
  } else {
    await notify('Task Failed', taskTitle);
  }
}
