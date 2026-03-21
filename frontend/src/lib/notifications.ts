/**
 * Cross-platform notification abstraction.
 * Tauri: uses @tauri-apps/plugin-notification
 * Browser: uses Notification API (unchanged behavior)
 */
import { isTauri } from '@/lib/platform';

interface NotifyOptions {
  title: string;
  body?: string;
}

/**
 * Send a native notification. No-op if permissions not granted.
 */
export async function sendNotification(opts: NotifyOptions): Promise<void> {
  if (isTauri()) {
    try {
      const {
        sendNotification: tauriNotify,
        isPermissionGranted,
        requestPermission,
      } = await import('@tauri-apps/plugin-notification');

      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === 'granted';
      }
      if (!granted) return;

      tauriNotify({ title: opts.title, body: opts.body });
    } catch {
      // Plugin not available, fall through to browser
      browserNotify(opts);
    }
  } else {
    browserNotify(opts);
  }
}

function browserNotify(opts: NotifyOptions) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(opts.title, { body: opts.body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(opts.title, { body: opts.body });
      }
    });
  }
}
