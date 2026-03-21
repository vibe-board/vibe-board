/**
 * Deep link handler for Tauri.
 *
 * Supports:
 *   vibeboard://connect?gateway=<url>&secret=<base64>
 *   → Auto-add E2EE server and begin pairing
 */
import { isTauri } from '@/lib/platform';

export interface DeepLinkPayload {
  action: 'connect';
  gatewayUrl: string;
  secret?: string;
}

/**
 * Parse a vibeboard:// deep link URL.
 */
export function parseDeepLink(url: string): DeepLinkPayload | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'vibeboard:') return null;

    if (parsed.hostname === 'connect' || parsed.pathname === '//connect') {
      const gatewayUrl = parsed.searchParams.get('gateway');
      if (!gatewayUrl) return null;
      return {
        action: 'connect',
        gatewayUrl,
        secret: parsed.searchParams.get('secret') || undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Initialize deep link listening for Tauri.
 * Call once at app startup.
 */
export async function initDeepLinkHandler(
  onConnect: (payload: DeepLinkPayload) => void
): Promise<void> {
  if (!isTauri()) return;

  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    await onOpenUrl((urls) => {
      for (const url of urls) {
        const payload = parseDeepLink(url);
        if (payload) {
          onConnect(payload);
          break;
        }
      }
    });
  } catch (err) {
    console.warn('Deep link plugin not available:', err);
  }
}
