import { useState, useCallback, useRef, useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '@shared/types';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;

interface AttemptListProps {
  attempts: Workspace[];
  onSelect: (attemptId: string) => void;
  scrollRootRef?: RefObject<HTMLDivElement | null>;
}

export function AttemptList({ attempts, onSelect, scrollRootRef }: AttemptListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasMore = visibleCount < attempts.length;
  const displayed = attempts.slice(0, visibleCount);

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, attempts.length));
    }
  }, [hasMore, attempts.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRootRef?.current ?? null, rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (attempts.length === 0) {
    return (
      <EmptyState
        title={t('tasks.noAttempts')}
        description={t('tasks.noAttemptsHint')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {displayed.map((attempt) => (
        <Card
          key={attempt.id}
          className="active:scale-[0.98] transition-transform cursor-pointer"
          onClick={() => onSelect(attempt.id)}
        >
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm truncate">
                {attempt.branch}
              </CardTitle>
              <CardDescription className="text-xs">
                {attempt.mode === 'worktree' ? 'Worktree' : 'Direct'}
                {' · '}
                {new Date(attempt.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {attempt.archived && (
                <Badge variant="done">{t('tasks.archived')}</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="h-1" />
      )}
    </div>
  );
}
