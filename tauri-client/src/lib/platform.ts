/**
 * True when the app is built for mobile (Android/iOS) via Tauri CLI.
 * Injected at build time through Vite's `define` based on TAURI_ENV_PLATFORM.
 */
declare const __TAURI_MOBILE__: boolean;

export function isMobile(): boolean {
  return typeof __TAURI_MOBILE__ !== 'undefined' && __TAURI_MOBILE__;
}
