import { useMemo } from 'react';
import { detectPlatform, type Platform } from '@/lib/platform';

export function usePlatform() {
  const platform = useMemo<Platform>(() => detectPlatform(), []);

  return {
    platform,
    isTauri: platform !== 'browser',
    isMobile: platform === 'mobile',
    isDesktop: platform === 'desktop',
    isBrowser: platform === 'browser',
  };
}
