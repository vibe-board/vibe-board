import { useDiffStream } from '@/hooks/useDiffStream';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import DiffViewSwitch from '@/components/DiffViewSwitch';
import DiffCard from '@/components/DiffCard';
import { NewCardHeader } from '@/components/ui/new-card';
import { ChevronsUp, ChevronsDown, ArrowLeft } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Diff, DiffChangeKind } from 'shared/types';
import type { Workspace } from 'shared/types';
import { useApi } from '@/hooks/useApi';
import GitOperations, {
  type GitOperationsInputs,
} from '@/components/tasks/Toolbar/GitOperations.tsx';

interface DiffsPanelProps {
  selectedAttempt: Workspace | null;
  commitSha?: string | null;
  onClearCommit?: () => void;
  repoId?: string | null;
  gitOps?: GitOperationsInputs;
}

type DiffCollapseDefaults = Record<DiffChangeKind, boolean>;

const DEFAULT_DIFF_COLLAPSE_DEFAULTS: DiffCollapseDefaults = {
  added: false,
  deleted: true,
  modified: false,
  renamed: true,
  copied: true,
  permissionChange: true,
};

const DEFAULT_COLLAPSE_MAX_LINES = 200;

const exceedsMaxLineCount = (d: Diff, maxLines: number): boolean => {
  if (d.additions != null || d.deletions != null)
    return (d.additions ?? 0) + (d.deletions ?? 0) > maxLines;

  return true;
};

const getDiffId = ({ diff, index }: { diff: Diff; index: number }) =>
  `${diff.newPath || diff.oldPath || index}`;

export function DiffsPanel({
  selectedAttempt,
  commitSha,
  onClearCommit,
  repoId,
  gitOps,
}: DiffsPanelProps) {
  const { attemptsApi } = useApi();
  const { t } = useTranslation('tasks');
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const isCommitMode = !!commitSha;

  const {
    diffs: streamDiffs,
    error: streamError,
    isInitialized: streamInitialized,
  } = useDiffStream(isCommitMode ? null : (selectedAttempt?.id ?? null), true, {
    repoId,
  });

  const {
    data: commitDiffs,
    isLoading: commitLoading,
    error: commitError,
  } = useQuery({
    queryKey: ['commitDiff', selectedAttempt?.id, commitSha],
    queryFn: () =>
      attemptsApi.getCommitDiff(selectedAttempt!.id, commitSha!, repoId ?? ''),
    enabled: isCommitMode && !!selectedAttempt?.id && !!commitSha,
    staleTime: 60_000,
  });

  const diffs = useMemo(
    () => (isCommitMode ? (commitDiffs ?? []) : streamDiffs),
    [isCommitMode, commitDiffs, streamDiffs]
  );
  const error = isCommitMode
    ? commitError
      ? String(commitError)
      : null
    : streamError;
  const loading = isCommitMode ? commitLoading : !streamInitialized;

  const fileCount = diffs.length;
  const added = diffs.reduce((sum, d) => sum + (d.additions ?? 0), 0);
  const deletedCount = diffs.reduce((sum, d) => sum + (d.deletions ?? 0), 0);

  // Apply collapse defaults for new diffs (only in stream mode, once after load)
  const [collapseDefaultsApplied, setCollapseDefaultsApplied] = useState(false);
  useEffect(() => {
    if (isCommitMode || diffs.length === 0 || collapseDefaultsApplied) return;
    const toCollapse = diffs
      .filter(
        (diff) =>
          DEFAULT_DIFF_COLLAPSE_DEFAULTS[diff.change] ||
          exceedsMaxLineCount(diff, DEFAULT_COLLAPSE_MAX_LINES)
      )
      .map((d, i) => getDiffId({ diff: d, index: i }));

    if (toCollapse.length > 0) {
      setCollapsedIds(new Set(toCollapse));
    }
    setCollapseDefaultsApplied(true);
  }, [isCommitMode, diffs, collapseDefaultsApplied]);

  const ids = useMemo(() => {
    return diffs.map((d, i) => getDiffId({ diff: d, index: i }));
  }, [diffs]);

  const toggle = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          // Collapsed → expand
          next.delete(id);
          if (isMobile) {
            // Mobile: collapse all others so only this one is expanded
            for (const otherId of ids) {
              if (otherId !== id) next.add(otherId);
            }
          }
        } else {
          // Expanded → collapse
          next.add(id);
        }
        return next;
      });
    },
    [isMobile, ids]
  );

  const allCollapsed = collapsedIds.size === diffs.length;
  const handleCollapseAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(ids));
  }, [allCollapsed, ids]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">
          {t('diff.errorLoadingDiff', { error })}
        </div>
      </div>
    );
  }

  return (
    <DiffsPanelContent
      diffs={diffs}
      fileCount={fileCount}
      added={added}
      deleted={deletedCount}
      collapsedIds={collapsedIds}
      allCollapsed={allCollapsed}
      handleCollapseAll={handleCollapseAll}
      toggle={toggle}
      selectedAttempt={selectedAttempt}
      gitOps={gitOps}
      loading={loading}
      onBack={isCommitMode ? onClearCommit : undefined}
      isMobile={isMobile}
      t={t}
    />
  );
}

interface DiffsPanelContentProps {
  diffs: Diff[];
  fileCount: number;
  added: number;
  deleted: number;
  collapsedIds: Set<string>;
  allCollapsed: boolean;
  handleCollapseAll: () => void;
  toggle: (id: string) => void;
  selectedAttempt: Workspace | null;
  gitOps?: GitOperationsInputs;
  loading: boolean;
  onBack?: () => void;
  isMobile: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function DiffsPanelContent({
  diffs,
  fileCount,
  added,
  deleted,
  collapsedIds,
  allCollapsed,
  handleCollapseAll,
  toggle,
  selectedAttempt,
  gitOps,
  loading,
  onBack,
  isMobile,
  t,
}: DiffsPanelContentProps) {
  return (
    <div className="h-full flex flex-col relative">
      {(diffs.length > 0 || onBack) && (
        <NewCardHeader
          className="sticky top-0 z-10"
          actions={
            <>
              {onBack && (
                <Button
                  variant="icon"
                  onClick={onBack}
                  aria-label={t('commit.backToCommits')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {diffs.length > 0 && (
                <>
                  <DiffViewSwitch />
                  {!isMobile && (
                    <>
                      <div className="h-4 w-px bg-border" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="icon"
                              onClick={handleCollapseAll}
                              aria-pressed={allCollapsed}
                              aria-label={
                                allCollapsed
                                  ? t('diff.expandAll')
                                  : t('diff.collapseAll')
                              }
                            >
                              {allCollapsed ? (
                                <ChevronsDown className="h-4 w-4" />
                              ) : (
                                <ChevronsUp className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {allCollapsed
                              ? t('diff.expandAll')
                              : t('diff.collapseAll')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                </>
              )}
            </>
          }
        >
          <div className="flex items-center">
            <span
              className="text-sm text-muted-foreground whitespace-nowrap"
              aria-live="polite"
            >
              {t('diff.filesChanged', { count: fileCount })}{' '}
              <span className="text-green-600 dark:text-green-500">
                +{added}
              </span>{' '}
              <span className="text-red-600 dark:text-red-500">-{deleted}</span>
            </span>
          </div>
        </NewCardHeader>
      )}
      {gitOps && selectedAttempt && (
        <div className="px-3">
          <GitOperations selectedAttempt={selectedAttempt} {...gitOps} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : diffs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('diff.noChanges')}
          </div>
        ) : (
          diffs.map((diff, idx) => {
            const id = diff.newPath || diff.oldPath || String(idx);
            return (
              <DiffCard
                key={id}
                diff={diff}
                expanded={!collapsedIds.has(id)}
                onToggle={() => toggle(id)}
                selectedAttempt={selectedAttempt}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
