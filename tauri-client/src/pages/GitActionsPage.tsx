import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BaseCodingAgent } from '@shared/types';
import {
  useBranchStatus,
  useMergeAttempt,
  usePushAttempt,
  useRebaseAttempt,
  useCreatePr,
  useRenameBranch,
  useChangeTargetBranch,
  useRepoBranches,
  usePrComments,
} from '@/api/hooks/useAttempts';
import { useAttemptRepos } from '@/api/hooks/useAttemptRepos';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  ArrowLeft,
  GitMerge,
  GitPullRequest,
  Upload,
  RotateCcw,
  Pencil,
  ArrowRightLeft,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';

type ActiveForm =
  | 'merge'
  | 'push'
  | 'createPR'
  | 'prComments'
  | 'rebase'
  | 'renameBranch'
  | 'changeTarget'
  | null;

export default function GitActionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId, attemptId } = useParams<{
    taskId: string;
    attemptId: string;
  }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  const [activeForm, setActiveForm] = useState<ActiveForm>(null);

  // Rename branch state
  const [newBranchName, setNewBranchName] = useState('');

  // Create PR state
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(false);

  // Rebase state
  const [rebaseTarget, setRebaseTarget] = useState('');

  // Change target state
  const [changeTargetBranch, setChangeTargetBranch] = useState('');

  const { data: repos, isLoading: reposLoading } = useAttemptRepos(
    attemptId ?? '',
  );
  const repoId = repos?.[0]?.id ?? '';
  const targetBranch = repos?.[0]?.target_branch ?? '';

  const { data: branchStatuses, isLoading: statusLoading } = useBranchStatus(
    attemptId ?? '',
  );
  const branchStatus = branchStatuses?.[0];

  const { data: branches } = useRepoBranches(repoId);

  const { data: prComments, isLoading: commentsLoading } = usePrComments(
    attemptId ?? '',
    repoId,
    { enabled: activeForm === 'prComments' && !!repoId },
  );

  // Mutations
  const mergeAttempt = useMergeAttempt();
  const pushAttempt = usePushAttempt();
  const rebaseAttempt = useRebaseAttempt();
  const createPr = useCreatePr();
  const renameBranch = useRenameBranch();
  const changeTarget = useChangeTargetBranch();

  const backUrl = `/tasks/${taskId}/attempts/${attemptId}?project_id=${encodeURIComponent(projectId ?? '')}`;
  const handleBack = () => navigate(backUrl);

  const isLoading = reposLoading || statusLoading;

  if (!taskId || !attemptId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
      </div>
    );
  }

  const toggleForm = (form: ActiveForm) => {
    setActiveForm(activeForm === form ? null : form);
  };

  const handleMerge = () => {
    mergeAttempt.mutate(
      {
        id: attemptId,
        body: {
          repo_id: repoId,
          session_id: '',
          executor_profile_id: {
            executor: 'CLAUDE_CODE' as BaseCodingAgent,
            variant: null,
          },
          commit_message_executor_profile_id: null,
          commit_message_enabled: false,
          commit_message_single_commit: false,
        },
      },
      { onSuccess: () => setActiveForm(null) },
    );
  };

  const handlePush = () => {
    pushAttempt.mutate(
      { id: attemptId, body: { repo_id: repoId } },
      { onSuccess: () => setActiveForm(null) },
    );
  };

  const handleCreatePR = () => {
    createPr.mutate(
      {
        id: attemptId,
        body: {
          title: prTitle,
          body: prBody || null,
          target_branch: targetBranch || null,
          draft: prDraft,
          repo_id: repoId,
          auto_generate_description: false,
        },
      },
      { onSuccess: () => setActiveForm(null) },
    );
  };

  const handleRebase = () => {
    rebaseAttempt.mutate(
      {
        id: attemptId,
        body: {
          repo_id: repoId,
          old_base_branch: null,
          new_base_branch: rebaseTarget || null,
        },
      },
      { onSuccess: () => setActiveForm(null) },
    );
  };

  const handleRenameBranch = () => {
    if (!newBranchName.trim()) return;
    renameBranch.mutate(
      {
        id: attemptId,
        body: { new_branch_name: newBranchName.trim() },
      },
      { onSuccess: () => { setNewBranchName(''); setActiveForm(null); } },
    );
  };

  const handleChangeTarget = () => {
    if (!changeTargetBranch.trim()) return;
    changeTarget.mutate(
      {
        id: attemptId,
        body: {
          repo_id: repoId,
          new_target_branch: changeTargetBranch.trim(),
        },
      },
      { onSuccess: () => { setChangeTargetBranch(''); setActiveForm(null); } },
    );
  };

  const hasConflicts =
    branchStatus?.conflict_op != null &&
    branchStatus.conflicted_files.length > 0;
  const isRebaseInProgress = branchStatus?.is_rebase_in_progress ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={handleBack}
          className="p-1 -ml-1 active:bg-muted rounded-md transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">{t('git.actions')}</h1>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Branch info card */}
            {branchStatus && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">
                    {branchStatus.repo_name}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    {t('git.branch')}:{' '}
                    <span className="font-mono text-foreground">
                      {branchStatus.head_oid
                        ? branchStatus.head_oid.slice(0, 7)
                        : '—'}
                    </span>
                  </p>
                  <p>
                    {t('git.targetBranch')}:{' '}
                    <span className="font-mono text-foreground">
                      {branchStatus.target_branch_name}
                    </span>
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  {branchStatus.commits_ahead != null &&
                    branchStatus.commits_ahead > 0 && (
                      <span className="text-green-600">
                        +{branchStatus.commits_ahead} {t('git.ahead')}
                      </span>
                    )}
                  {branchStatus.commits_behind != null &&
                    branchStatus.commits_behind > 0 && (
                      <span className="text-amber-600">
                        -{branchStatus.commits_behind} {t('git.behind')}
                      </span>
                    )}
                  {branchStatus.has_uncommitted_changes && (
                    <span className="text-blue-600">
                      {t('git.uncommitted')}
                    </span>
                  )}
                </div>
                {/* Conflict warning */}
                {hasConflicts && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('git.conflict')}:{' '}
                    {branchStatus.conflicted_files.length}{' '}
                    {t('git.conflictedFiles')}
                  </div>
                )}
                {isRebaseInProgress && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('git.rebaseInProgress')}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              {/* Merge */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('merge')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('tasks.merge')}
                    </span>
                  </div>
                  {activeForm === 'merge' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'merge' && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('git.mergeHint', {
                        target: branchStatus?.target_branch_name ?? 'main',
                      })}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleMerge}
                      disabled={mergeAttempt.isPending}
                      className="w-full"
                    >
                      {mergeAttempt.isPending
                        ? t('common.loading')
                        : t('tasks.merge')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Push */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('push')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('tasks.push')}
                    </span>
                  </div>
                  {activeForm === 'push' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'push' && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('git.pushHint')}
                    </p>
                    <Button
                      size="sm"
                      onClick={handlePush}
                      disabled={pushAttempt.isPending}
                      className="w-full"
                    >
                      {pushAttempt.isPending
                        ? t('common.loading')
                        : t('tasks.push')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Create PR */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('createPR')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('tasks.createPR')}
                    </span>
                  </div>
                  {activeForm === 'createPR' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'createPR' && (
                  <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
                    <Input
                      label={t('git.prTitle')}
                      value={prTitle}
                      onChange={(e) => setPrTitle(e.target.value)}
                      placeholder={t('git.prTitlePlaceholder')}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">
                        {t('git.prBody')}
                      </label>
                      <textarea
                        value={prBody}
                        onChange={(e) => setPrBody(e.target.value)}
                        placeholder={t('git.prBodyPlaceholder')}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={prDraft}
                        onChange={(e) => setPrDraft(e.target.checked)}
                        className="rounded border-input"
                      />
                      {t('git.draftPR')}
                    </label>
                    <Button
                      size="sm"
                      onClick={handleCreatePR}
                      disabled={createPr.isPending || !prTitle.trim()}
                      className="w-full"
                    >
                      {createPr.isPending
                        ? t('common.loading')
                        : t('tasks.createPR')}
                    </Button>
                  </div>
                )}
              </div>

              {/* View PR Comments */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('prComments')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('git.viewPrComments')}
                    </span>
                  </div>
                  {activeForm === 'prComments' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'prComments' && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    {commentsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <LoadingSpinner />
                      </div>
                    ) : !prComments || prComments.comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {t('git.noPrComments')}
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-auto">
                        {prComments.comments.map((comment) => (
                          <div
                            key={String(comment.id)}
                            className="rounded-md border border-border p-3 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {comment.author}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(
                                  comment.created_at,
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            {comment.comment_type === 'review' &&
                              comment.path && (
                                <p className="text-xs text-muted-foreground font-mono">
                                  {comment.path}
                                  {comment.line != null &&
                                    `:${String(comment.line)}`}
                                </p>
                              )}
                            <p className="text-sm whitespace-pre-wrap">
                              {comment.body}
                            </p>
                            {comment.url && (
                              <a
                                href={comment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {t('git.viewOnGithub')}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rebase */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('rebase')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('tasks.rebase')}
                    </span>
                  </div>
                  {activeForm === 'rebase' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'rebase' && (
                  <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {t('git.rebaseHint')}
                    </p>
                    {branches && branches.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">
                          {t('git.rebaseTarget')}
                        </label>
                        <select
                          value={rebaseTarget}
                          onChange={(e) => setRebaseTarget(e.target.value)}
                          className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">
                            {t('git.selectBranch')}
                          </option>
                          {branches
                            .filter((b) => !b.is_remote)
                            .map((b) => (
                              <option key={b.name} value={b.name}>
                                {b.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={handleRebase}
                      disabled={rebaseAttempt.isPending}
                      className="w-full"
                    >
                      {rebaseAttempt.isPending
                        ? t('common.loading')
                        : t('tasks.rebase')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Rename Branch */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('renameBranch')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('git.renameBranch')}
                    </span>
                  </div>
                  {activeForm === 'renameBranch' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'renameBranch' && (
                  <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
                    <Input
                      label={t('git.newBranchName')}
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder={t('git.newBranchNamePlaceholder')}
                    />
                    <Button
                      size="sm"
                      onClick={handleRenameBranch}
                      disabled={
                        renameBranch.isPending || !newBranchName.trim()
                      }
                      className="w-full"
                    >
                      {renameBranch.isPending
                        ? t('common.loading')
                        : t('git.renameBranch')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Change Target Branch */}
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleForm('changeTarget')}
                  className="flex items-center justify-between w-full px-4 py-3 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t('git.changeTargetBranch')}
                    </span>
                  </div>
                  {activeForm === 'changeTarget' ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {activeForm === 'changeTarget' && (
                  <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
                    {branches && branches.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">
                          {t('git.newTargetBranch')}
                        </label>
                        <select
                          value={changeTargetBranch}
                          onChange={(e) =>
                            setChangeTargetBranch(e.target.value)
                          }
                          className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">
                            {t('git.selectBranch')}
                          </option>
                          {branches.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={handleChangeTarget}
                      disabled={
                        changeTarget.isPending || !changeTargetBranch.trim()
                      }
                      className="w-full"
                    >
                      {changeTarget.isPending
                        ? t('common.loading')
                        : t('git.changeTargetBranch')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Success/error messages */}
            {mergeAttempt.isSuccess && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {t('git.mergeSuccess')}
              </div>
            )}
            {pushAttempt.isSuccess && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {t('git.pushSuccess')}
              </div>
            )}
            {createPr.isSuccess && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="h-4 w-4" />
                {t('git.prSuccess')}
              </div>
            )}
            {(mergeAttempt.isError ||
              pushAttempt.isError ||
              rebaseAttempt.isError ||
              createPr.isError ||
              renameBranch.isError ||
              changeTarget.isError) && (
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t('common.error')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-2 border-t border-border shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleBack}
          className="flex items-center gap-1.5"
        >
          {t('common.back')}
        </Button>
      </div>
    </div>
  );
}
