/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Tauri env vars exposed via envPrefix in vite.config.ts
interface ImportMetaEnv {
  readonly TAURI_ENV_PLATFORM?: string;
  readonly TAURI_ENV_ARCH?: string;
  readonly TAURI_ENV_FAMILY?: string;
  readonly TAURI_ENV_DEBUG?: string;
  readonly TAURI_ENV_TARGET_TRIPLE?: string;
}
