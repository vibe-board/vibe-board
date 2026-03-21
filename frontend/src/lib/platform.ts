export type Platform = 'browser' | 'desktop' | 'mobile';

let detectedPlatform: Platform | null = null;

/**
 * Detect the current runtime platform.
 * - 'desktop': Tauri on Windows/macOS/Linux
 * - 'mobile': Tauri on Android/iOS
 * - 'browser': Standard browser (no Tauri)
 */
export function detectPlatform(): Platform {
  if (detectedPlatform) return detectedPlatform;

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    // Check the TAURI_ENV_PLATFORM build-time env var injected by Vite
    const envPlatform = import.meta.env.TAURI_ENV_PLATFORM;
    if (envPlatform === 'android' || envPlatform === 'ios') {
      detectedPlatform = 'mobile';
    } else {
      detectedPlatform = 'desktop';
    }
  } else {
    detectedPlatform = 'browser';
  }

  return detectedPlatform;
}

export function isTauri(): boolean {
  return detectPlatform() !== 'browser';
}

export function isMobilePlatform(): boolean {
  return detectPlatform() === 'mobile';
}

export function isDesktopPlatform(): boolean {
  return detectPlatform() === 'desktop';
}

export function isBrowserPlatform(): boolean {
  return detectPlatform() === 'browser';
}
