import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400">
      <WifiOff className="h-4 w-4" />
      <span>Offline &mdash; showing cached data (read-only)</span>
    </div>
  );
}
