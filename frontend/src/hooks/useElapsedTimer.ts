import { useEffect, useState } from 'react';

/**
 * Returns elapsed seconds since `startedAt`, ticking every second.
 * Returns 0 if `startedAt` is null/undefined.
 */
export function useElapsedTimer(startedAt: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(() => {
    if (!startedAt) return 0;
    return Math.max(
      0,
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    );
  });

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    const update = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
        )
      );
    update();

    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
