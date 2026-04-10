/**
 * Tauri injects `window.__TAURI__` when running inside a Tauri WebView.
 * This declaration makes it available for runtime environment detection.
 */
interface Window {
  __TAURI__?: Record<string, unknown>;
}
