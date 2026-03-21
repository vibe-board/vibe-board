import { isMobilePlatform } from '@/lib/platform';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * Returns true when the app should use mobile layout.
 * - Tauri mobile platforms (Android/iOS): always true
 * - Otherwise: based on screen width < 768px
 */
export function useIsMobileLayout(): boolean {
  const isNarrow = useMediaQuery('(max-width: 767px)');
  return isMobilePlatform() || isNarrow;
}
