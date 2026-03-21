import { invoke } from '@tauri-apps/api/core';

export async function getPlatformInfo() {
  return invoke<{ os: string; arch: string; version: string }>('get_platform_info');
}

export async function isMobile() {
  return invoke<boolean>('is_mobile');
}

export function isTauri(): boolean {
  return '__TAURI__' in window;
}
