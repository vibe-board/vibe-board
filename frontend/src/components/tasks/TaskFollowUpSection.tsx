import {
  CheckSquare,
  Loader2,
  Send,
  StopCircle,
  AlertCircle,
  Clock,
  X,
  Paperclip,
  Terminal,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
//
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ScratchType, type Task } from 'shared/types';
import { useBranchStatus, useNavigateWithSearch } from '@/hooks';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
import { cn } from '@/lib/utils';
//
import { useReview } from '@/contexts/ReviewProvider';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { useEntries } from '@/contexts/EntriesContext';
import { useGitOperationsError } from '@/contexts/GitOperationsContext';
import { useKeySubmitFollowUp, Scope } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useProject } from '@/contexts/ProjectContext';
//
import { VariantSelector } from '@/components/tasks/VariantSelector';
import { AgentSelector } from '@/components/tasks/AgentSelector';
import { useAttemptBranch } from '@/hooks/useAttemptBranch';
import { FollowUpConflictSection } from '@/components/tasks/follow-up/FollowUpConflictSection';
import { ClickedElementsBanner } from '@/components/tasks/ClickedElementsBanner';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useFollowUpSend } from '@/hooks/useFollowUpSend';
import { useVariant } from '@/hooks/useVariant';
import type {
  DraftFollowUpData,
  ExecutorProfileId,
  QueueStatus,
  BaseCodingAgent,
} from 'shared/types';
import { getLatestProfileFromProcesses } from '@/utils/executor';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import { useTranslation } from 'react-i18next';
import { useScratch } from '@/hooks/useScratch';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { PrCommentsDialog } from '@/components/dialogs/tasks/PrCommentsDialog';
import type { NormalizedComment } from '@/components/ui/wysiwyg/nodes/pr-comment-node';
import type { Session } from 'shared/types';
import { buildAgentPrompt } from '@/utils/promptMessage';
import { useApprovalMutation } from '@/hooks/useApprovalMutation';
import { paths } from '@/lib/paths';

interface TaskFollowUpSectionProps {
  task: Task;
  session?: Session;
}

export function TaskFollowUpSection({
  task,
  session,
}: TaskFollowUpSectionProps) {
  const { tasksApi, attemptsApi, imagesApi, queueApi } = useApi();
  const { t } = useTranslation('tasks');
  const { projectId } = useProject();
  const navigate = useNavigateWithSearch();

  // Derive IDs from session
  const workspaceId = session?.workspace_id;
  const sessionId = session?.id;

  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId, task.id);

  const { data: branchStatus, refetch: refetchBranchStatus } =
    useBranchStatus(workspaceId);
  const { repos, selectedRepoId } = useAttemptRepo(workspaceId);

  const getSelectedRepoId = useCallback(() => {
    return selectedRepoId ?? repos[0]?.id;
  }, [selectedRepoId, repos]);

  const repoWithConflicts = useMemo(
    () =>
      branchStatus?.find(
        (r) => r.is_rebase_in_progress || (r.conflicted_files?.length ?? 0) > 0
      ),
    [branchStatus]
  );
  const { branch: attemptBranch, refetch: refetchAttemptBranch } =
    useAttemptBranch(workspaceId);
  const { profiles } = useUserSystem();
  const { comments, generateReviewMarkdown, clearComments } = useReview();
  const {
    generateMarkdown: generateClickedMarkdown,
    clearElements: clearClickedElements,
  } = useClickedElements();
  const { enableScope, disableScope } = useHotkeysContext();

  const reviewMarkdown = useMemo(
    () => generateReviewMarkdown(),
    [generateReviewMarkdown]
  );

  const clickedMarkdown = useMemo(
    () => generateClickedMarkdown(),
    [generateClickedMarkdown]
  );

  // Non-editable conflict resolution instructions (derived, like review comments)
  const conflictResolutionInstructions = useMemo(() => {
    if (!repoWithConflicts?.conflicted_files?.length) return null;
    return buildResolveConflictsInstructions(
      attemptBranch,
      repoWithConflicts.target_branch_name,
      repoWithConflicts.conflicted_files,
      repoWithConflicts.conflict_op ?? null,
      repoWithConflicts.repo_name
    );
  }, [attemptBranch, repoWithConflicts]);

  // Editor state (persisted via scratch)
  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.DRAFT_FOLLOW_UP, sessionId ?? '');

  // Derive the message and variant from scratch
  const scratchData: DraftFollowUpData | undefined =
    scratch?.payload?.type === 'DRAFT_FOLLOW_UP'
      ? scratch.payload.data
      : undefined;

  // Track whether the follow-up textarea is focused
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Local message state for immediate UI feedback (before debounced save)
  const [localMessage, setLocalMessage] = useState('');

  // Variant selection - derive default from latest process
  const latestProfileId = useMemo(
    () => getLatestProfileFromProcesses(processes),
    [processes]
  );

  // Executor selection - allows changing executor on follow-up
  const [selectedExecutor, setSelectedExecutor] =
    useState<BaseCodingAgent | null>(latestProfileId?.executor ?? null);

  // Track if executor was changed from original
  const executorChanged = useMemo(() => {
    if (!latestProfileId || !selectedExecutor) return false;
    return latestProfileId.executor !== selectedExecutor;
  }, [latestProfileId, selectedExecutor]);

  // Update selected executor when latestProfileId changes (but not if user manually selected)
  const prevLatestProfileRef = useRef(latestProfileId);
  useEffect(() => {
    if (prevLatestProfileRef.current !== latestProfileId && latestProfileId) {
      prevLatestProfileRef.current = latestProfileId;
      // Only auto-update if no manual selection or if the process changed
      setSelectedExecutor(latestProfileId.executor);
    }
  }, [latestProfileId]);

  const currentProfile = useMemo(() => {
    if (!selectedExecutor) return null;
    return profiles?.[selectedExecutor] ?? null;
  }, [selectedExecutor, profiles]);

  // Variant selection with priority: user selection > scratch > process
  const { selectedVariant, setSelectedVariant: setVariantFromHook } =
    useVariant({
      processVariant: latestProfileId?.variant ?? null,
      scratchVariant: scratchData?.executor_profile_id?.variant,
    });

  // Ref to track current variant for use in message save callback
  const variantRef = useRef<string | null>(selectedVariant);
  useEffect(() => {
    variantRef.current = selectedVariant;
  }, [selectedVariant]);

  // Refs to stabilize callbacks - avoid re-creating callbacks when these values change
  const scratchRef = useRef(scratch);
  useEffect(() => {
    scratchRef.current = scratch;
  }, [scratch]);

  // Save scratch helper (used for both message and variant changes)
  // Uses scratchRef to avoid callback invalidation when scratch updates
  const saveToScratch = useCallback(
    async (message: string, variant: string | null) => {
      if (!workspaceId || !latestProfileId?.executor) return;
      // Don't create empty scratch entries - only save if there's actual content,
      // a variant is selected, or scratch already exists (to allow clearing a draft)
      if (!message.trim() && !variant && !scratchRef.current) return;
      try {
        await updateScratch({
          payload: {
            type: 'DRAFT_FOLLOW_UP',
            data: {
              message,
              executor_profile_id: {
                executor: latestProfileId.executor,
                variant,
              },
            },
          },
        });
      } catch (e) {
        console.error('Failed to save follow-up draft', e);
      }
    },
    [workspaceId, updateScratch, latestProfileId?.executor]
  );

  // Wrapper to update variant and save to scratch immediately
  const setSelectedVariant = useCallback(
    (variant: string | null) => {
      setVariantFromHook(variant);
      // Save immediately when user changes variant
      saveToScratch(localMessage, variant);
    },
    [setVariantFromHook, saveToScratch, localMessage]
  );

  // Debounced save for message changes (uses current variant from ref)
  const { debounced: setFollowUpMessage, cancel: cancelDebouncedSave } =
    useDebouncedCallback(
      useCallback(
        (value: string) => saveToScratch(value, variantRef.current),
        [saveToScratch]
      ),
      500
    );

  // Sync local message from scratch only on initial load (not on blur/focus transitions)
  // to avoid overwriting user input with stale scratch data during debounced save window
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (isScratchLoading) return;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    setLocalMessage(scratchData?.message ?? '');
  }, [isScratchLoading, scratchData?.message]);

  // During retry, follow-up box is greyed/disabled (not hidden)
  // Use RetryUi context so optimistic retry immediately disables this box
  const { activeRetryProcessId } = useRetryUi();
  const isRetryActive = !!activeRetryProcessId;

  // Queue status for queuing follow-up messages while agent is running
  const queryClient = useQueryClient();
  const QUEUE_STATUS_KEY = 'queue-status';

  const {
    data: queueStatus = { status: 'empty' as const },
    refetch: refreshQueueStatus,
  } = useQuery<QueueStatus>({
    queryKey: [QUEUE_STATUS_KEY, sessionId],
    queryFn: () => queueApi.getStatus(sessionId!),
    enabled: !!sessionId,
  });

  const isQueued = queueStatus.status === 'queued';
  const queuedMessage = isQueued
    ? (queueStatus as Extract<QueueStatus, { status: 'queued' }>).message
    : null;

  const queueMutation = useMutation({
    mutationFn: ({
      message,
      executor_profile_id,
    }: {
      message: string;
      executor_profile_id: ExecutorProfileId;
    }) => queueApi.queue(sessionId!, { message, executor_profile_id }),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => queueApi.cancel(sessionId!),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  const queueMessage = useCallback(
    async (message: string, executorProfileId: ExecutorProfileId) => {
      if (!sessionId) return;
      await queueMutation.mutateAsync({
        message,
        executor_profile_id: executorProfileId,
      });
    },
    [sessionId, queueMutation]
  );

  const cancelQueue = useCallback(async () => {
    if (!sessionId) return;
    await cancelMutation.mutateAsync();
  }, [sessionId, cancelMutation]);

  const isQueueLoading = queueMutation.isPending || cancelMutation.isPending;

  // Track previous process count to detect new processes
  const prevProcessCountRef = useRef(processes.length);

  // Refresh queue status when execution stops OR when a new process starts
  useEffect(() => {
    const prevCount = prevProcessCountRef.current;
    prevProcessCountRef.current = processes.length;

    if (!workspaceId) return;

    // Refresh when execution stops
    if (!isAttemptRunning) {
      refreshQueueStatus();
      return;
    }

    // Refresh when a new process starts (could be queued message consumption or follow-up)
    if (processes.length > prevCount) {
      refreshQueueStatus();
    }
  }, [isAttemptRunning, workspaceId, processes.length, refreshQueueStatus]);

  // When queued, display the queued message content so user can edit it
  const displayMessage =
    isQueued && queuedMessage ? queuedMessage.data.message : localMessage;

  // Check if there's a pending approval - users shouldn't be able to type during approvals
  // but should be able to type during question approvals (ask_user_question)
  const { entries, setFollowUpEditorMessage, multiSelectState } = useEntries();

  // Sync localMessage to context so AskUserQuestionBanner can access it
  useEffect(() => {
    setFollowUpEditorMessage(localMessage);
  }, [localMessage, setFollowUpEditorMessage]);
  const { hasPendingApproval, hasPendingQuestion, pendingQuestionInfo } =
    useMemo(() => {
      let hasPendingApproval = false;
      let hasPendingQuestion = false;
      let pendingQuestionInfo: {
        approvalId: string;
        executionProcessId: string;
        question: string;
      } | null = null;
      for (const entry of entries) {
        if (entry.type !== 'NORMALIZED_ENTRY') continue;
        const entryType = entry.content.entry_type;
        if (
          entryType.type === 'tool_use' &&
          entryType.status.status === 'pending_approval'
        ) {
          if (entryType.action_type.action === 'ask_user_question') {
            hasPendingQuestion = true;
            // Get the first unanswered question
            const questions = entryType.action_type.questions;
            if (questions.length > 0 && entryType.status.approval_id) {
              pendingQuestionInfo = {
                approvalId: entryType.status.approval_id,
                executionProcessId: entry.executionProcessId,
                question: questions[0].question,
              };
            }
          } else {
            hasPendingApproval = true;
          }
        }
      }
      return { hasPendingApproval, hasPendingQuestion, pendingQuestionInfo };
    }, [entries]);

  const { answer: submitQuestionAnswer } = useApprovalMutation();
  const { setMergeError } = useGitOperationsError();

  // Send follow-up action
  const { isSendingFollowUp, followUpError, setFollowUpError, onSendFollowUp } =
    useFollowUpSend({
      sessionId,
      message: localMessage,
      conflictMarkdown: conflictResolutionInstructions,
      reviewMarkdown,
      clickedMarkdown,
      executor: selectedExecutor,
      variant: selectedVariant,
      allowExecutorChange: executorChanged,
      clearComments,
      clearClickedElements,
      onBeforeSend: () => {
        cancelDebouncedSave(); // Cancel pending save BEFORE HTTP request to prevent race condition
        setMergeError(null); // Clear any persisted merge error — user is starting a new conversation
      },
      onAfterSendCleanup: () => {
        setLocalMessage(''); // Clear local state immediately
        deleteScratch(); // Clear persisted draft so it doesn't reappear on reopen
      },
    });

  // In question mode, allow typing but handle submit as question answer
  const isInQuestionMode = hasPendingQuestion && !hasPendingApproval;

  // Separate logic for when textarea should be disabled vs when send button should be disabled
  const canTypeFollowUp = useMemo(() => {
    if (!workspaceId || processes.length === 0 || isSendingFollowUp) {
      return false;
    }

    if (isRetryActive) return false; // disable typing while retry editor is active
    if (hasPendingApproval) return false; // disable typing during approval (not question)
    // Note: isQueued no longer blocks typing - editing auto-cancels the queue
    return true;
  }, [
    workspaceId,
    processes.length,
    isSendingFollowUp,
    isRetryActive,
    hasPendingApproval,
  ]);

  const canSendFollowUp = useMemo(() => {
    if (!canTypeFollowUp || !selectedExecutor) {
      return false;
    }

    // In question mode, allow sending only if there's a typed message
    if (isInQuestionMode) {
      return Boolean(localMessage.trim());
    }

    // Allow sending if conflict instructions, review comments, clicked elements, or message is present
    return Boolean(
      conflictResolutionInstructions ||
        reviewMarkdown ||
        clickedMarkdown ||
        localMessage.trim()
    );
  }, [
    canTypeFollowUp,
    selectedExecutor,
    isInQuestionMode,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    localMessage,
  ]);
  // Allow editing during question mode
  const isEditable =
    !isRetryActive && (!hasPendingApproval || isInQuestionMode);

  const hasAnyScript = true;

  const handleRunSetupScript = useCallback(async () => {
    if (!workspaceId || isAttemptRunning) return;
    try {
      await attemptsApi.runSetupScript(workspaceId);
    } catch (error) {
      console.error('Failed to run setup script:', error);
    }
  }, [workspaceId, isAttemptRunning]);

  const handleRunCleanupScript = useCallback(async () => {
    if (!workspaceId || isAttemptRunning) return;
    try {
      await attemptsApi.runCleanupScript(workspaceId);
    } catch (error) {
      console.error('Failed to run cleanup script:', error);
    }
  }, [workspaceId, isAttemptRunning]);

  // Handler to queue the current message for execution after agent finishes
  const handleQueueMessage = useCallback(async () => {
    if (
      !localMessage.trim() &&
      !conflictResolutionInstructions &&
      !reviewMarkdown &&
      !clickedMarkdown
    ) {
      return;
    }

    // Cancel any pending debounced save and save immediately before queueing
    // This prevents the race condition where the debounce fires after queueing
    cancelDebouncedSave();
    await saveToScratch(localMessage, selectedVariant);

    // Combine all the content that would be sent (same as follow-up send)
    const { prompt } = buildAgentPrompt(
      localMessage,
      [conflictResolutionInstructions, clickedMarkdown, reviewMarkdown].filter(
        Boolean
      )
    );
    if (selectedExecutor) {
      await queueMessage(prompt, {
        executor: selectedExecutor,
        variant: selectedVariant,
      });
    }
  }, [
    localMessage,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    selectedExecutor,
    selectedVariant,
    queueMessage,
    cancelDebouncedSave,
    saveToScratch,
  ]);

  // State for retry-to-new-task loading
  const [isRetryingToNewTask, setIsRetryingToNewTask] = useState(false);

  // Handler to create a new task when executor is changed
  const handleRetryToNewTask = useCallback(async () => {
    if (!projectId || !selectedExecutor || !workspaceId) return;

    const userMessage = localMessage.trim();
    if (
      !userMessage &&
      !conflictResolutionInstructions &&
      !reviewMarkdown &&
      !clickedMarkdown
    ) {
      return;
    }

    try {
      setIsRetryingToNewTask(true);

      // Fetch conversation context from the current task
      const contextResponse = await tasksApi.getConversationContext(task.id);
      const context = contextResponse.context;

      // Build repo inputs from current workspace repos
      const repoInputs = repos.map((r) => ({
        repo_id: r.id,
        target_branch: r.target_branch,
      }));

      // Create and start a new task with the context
      const newTask = await tasksApi.createAndStart({
        task: {
          title: `Retry: ${task.title}`,
          project_id: projectId,
          description: null,
          status: null,
          image_ids: null,
          parent_workspace_id: null,
        },
        executor_profile_id: {
          executor: selectedExecutor,
          variant: selectedVariant,
        },
        repos: repoInputs,
        initial_context: context ?? undefined,
      });

      // Clear local state
      cancelDebouncedSave();
      setLocalMessage('');

      // Navigate to the new task
      navigate(`${paths.task(projectId, newTask.id)}/attempts/latest`);
    } catch (error) {
      console.error('Failed to retry to new task:', error);
    } finally {
      setIsRetryingToNewTask(false);
    }
  }, [
    projectId,
    selectedExecutor,
    selectedVariant,
    workspaceId,
    localMessage,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    task.id,
    task.title,
    repos,
    cancelDebouncedSave,
    navigate,
  ]);

  // Keyboard shortcut handler - send follow-up, queue, or submit question answer
  const handleSubmitShortcut = useCallback(
    (e?: KeyboardEvent) => {
      e?.preventDefault();
      if (isInQuestionMode && pendingQuestionInfo && localMessage.trim()) {
        // Submit question answer
        submitQuestionAnswer({
          approvalId: pendingQuestionInfo.approvalId,
          executionProcessId: pendingQuestionInfo.executionProcessId,
          answers: [
            {
              question: pendingQuestionInfo.question,
              answer: [localMessage.trim()],
            },
          ],
        });
        setLocalMessage('');
      } else if (isAttemptRunning) {
        // When running, CMD+Enter queues the message (if not already queued)
        if (!isQueued) {
          handleQueueMessage();
        }
      } else if (executorChanged) {
        // When executor has changed, create a new task with context
        handleRetryToNewTask();
      } else {
        onSendFollowUp();
      }
    },
    [
      isAttemptRunning,
      isQueued,
      handleQueueMessage,
      onSendFollowUp,
      executorChanged,
      handleRetryToNewTask,
      isInQuestionMode,
      pendingQuestionInfo,
      localMessage,
      submitQuestionAnswer,
    ]
  );

  // Ref to access setFollowUpMessage without adding it as a dependency
  const setFollowUpMessageRef = useRef(setFollowUpMessage);
  useEffect(() => {
    setFollowUpMessageRef.current = setFollowUpMessage;
  }, [setFollowUpMessage]);

  // Ref for followUpError to use in stable onChange handler
  const followUpErrorRef = useRef(followUpError);
  useEffect(() => {
    followUpErrorRef.current = followUpError;
  }, [followUpError]);

  // Helper to get current queue state from cache (avoids ref-sync pattern)
  const getQueueState = useCallback(() => {
    const status = queryClient.getQueryData<QueueStatus>([
      QUEUE_STATUS_KEY,
      sessionId,
    ]);
    const queued = status?.status === 'queued';
    const message = queued
      ? (status as Extract<QueueStatus, { status: 'queued' }>).message
      : null;
    return { isQueued: queued, queuedMessage: message };
  }, [queryClient, sessionId]);

  // Handle image paste - upload to container and insert markdown
  const handlePasteFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;

      for (const file of files) {
        try {
          const response = await imagesApi.uploadForAttempt(workspaceId, file);
          // Append markdown image to current message
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;

          // If queued, cancel queue and use queued message as base (same as editor change behavior)
          const {
            isQueued: currentlyQueued,
            queuedMessage: currentQueuedMessage,
          } = getQueueState();
          if (currentlyQueued && currentQueuedMessage) {
            cancelMutation.mutate();
            const base = currentQueuedMessage.data.message;
            const newMessage = base
              ? `${base}\n\n${imageMarkdown}`
              : imageMarkdown;
            setLocalMessage(newMessage);
            setFollowUpMessageRef.current(newMessage);
          } else {
            setLocalMessage((prev) => {
              const newMessage = prev
                ? `${prev}\n\n${imageMarkdown}`
                : imageMarkdown;
              setFollowUpMessageRef.current(newMessage); // Debounced save to scratch
              return newMessage;
            });
          }
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [workspaceId, getQueueState, cancelMutation]
  );

  // Action bar compact mode detection
  const actionBarRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsCompact(entry.contentRect.width < 480);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Attachment button - file input ref and handlers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length > 0) {
        handlePasteFiles(files);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [handlePasteFiles]
  );

  // Handler for PR comments insertion
  const handlePrCommentClick = useCallback(async () => {
    if (!workspaceId) return;
    const repoId = getSelectedRepoId();
    if (!repoId) return;

    const result = await PrCommentsDialog.show({
      attemptId: workspaceId,
      repoId,
    });
    if (result.comments.length > 0) {
      // Build markdown for all selected comments
      const markdownBlocks = result.comments.map((comment) => {
        const payload: NormalizedComment = {
          id:
            comment.comment_type === 'general'
              ? comment.id
              : comment.id.toString(),
          comment_type: comment.comment_type,
          author: comment.author,
          body: comment.body,
          created_at: comment.created_at,
          url: comment.url,
          // Include review-specific fields when available
          ...(comment.comment_type === 'review' && {
            path: comment.path,
            line: comment.line != null ? Number(comment.line) : null,
            diff_hunk: comment.diff_hunk,
          }),
        };
        return '```gh-comment\n' + JSON.stringify(payload, null, 2) + '\n```';
      });

      const markdown = markdownBlocks.join('\n\n');

      // Same pattern as image paste
      const { isQueued: currentlyQueued, queuedMessage: currentQueuedMessage } =
        getQueueState();
      if (currentlyQueued && currentQueuedMessage) {
        cancelMutation.mutate();
        const base = currentQueuedMessage.data.message;
        const newMessage = base ? `${base}\n\n${markdown}` : markdown;
        setLocalMessage(newMessage);
        setFollowUpMessageRef.current(newMessage);
      } else {
        setLocalMessage((prev) => {
          const newMessage = prev ? `${prev}\n\n${markdown}` : markdown;
          setFollowUpMessageRef.current(newMessage);
          return newMessage;
        });
      }
    }
  }, [workspaceId, getSelectedRepoId, getQueueState, cancelMutation]);

  // Stable onChange handler for WYSIWYGEditor
  const handleEditorChange = useCallback(
    (value: string) => {
      // Auto-cancel queue when user starts editing
      const { isQueued: currentlyQueued } = getQueueState();
      if (currentlyQueued) {
        cancelMutation.mutate();
      }
      setLocalMessage(value); // Immediate update for UI responsiveness
      setFollowUpMessageRef.current(value); // Debounced save to scratch
      if (followUpErrorRef.current) setFollowUpError(null);
    },
    [setFollowUpError, getQueueState, cancelMutation]
  );

  // Memoize placeholder to avoid re-renders
  const hasExtraContext = !!(reviewMarkdown || conflictResolutionInstructions);
  const editorPlaceholder = useMemo(() => {
    if (isInQuestionMode) {
      return 'Type a different answer...';
    }
    return hasExtraContext
      ? '(Optional) Add additional instructions... Type @ to insert tags or search files.'
      : 'Continue working on this task attempt... Type @ to insert tags or search files.';
  }, [hasExtraContext, isInQuestionMode]);

  // Register keyboard shortcuts
  useKeySubmitFollowUp(handleSubmitShortcut, {
    scope: Scope.FOLLOW_UP_READY,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    when: canSendFollowUp && isEditable,
  });

  // Enable FOLLOW_UP scope when textarea is focused AND editable
  useEffect(() => {
    if (isEditable && isTextareaFocused) {
      enableScope(Scope.FOLLOW_UP);
    } else {
      disableScope(Scope.FOLLOW_UP);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP);
    };
  }, [isEditable, isTextareaFocused, enableScope, disableScope]);

  // Enable FOLLOW_UP_READY scope when ready to send
  useEffect(() => {
    const isReady = isTextareaFocused && isEditable;

    if (isReady) {
      enableScope(Scope.FOLLOW_UP_READY);
    } else {
      disableScope(Scope.FOLLOW_UP_READY);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP_READY);
    };
  }, [isTextareaFocused, isEditable, enableScope, disableScope]);

  // When a process completes (e.g., agent resolved conflicts), refresh branch status promptly
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && workspaceId) {
      refetchBranchStatus();
      refetchAttemptBranch();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [
    isAttemptRunning,
    workspaceId,
    refetchBranchStatus,
    refetchAttemptBranch,
  ]);

  if (!workspaceId) return null;

  if (isScratchLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden',
        isRetryActive && 'opacity-50'
      )}
    >
      {/* Scrollable content area */}
      <div className="overflow-y-auto min-h-0 p-4">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {/* Review comments preview */}
            {reviewMarkdown && (
              <div className="mb-4">
                <div className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted p-3">
                  {reviewMarkdown}
                </div>
              </div>
            )}

            {/* Conflict notice and actions (optional UI) */}
            {branchStatus && (
              <FollowUpConflictSection
                workspaceId={workspaceId}
                attemptBranch={attemptBranch}
                branchStatus={branchStatus}
                isEditable={isEditable}
                onResolve={onSendFollowUp}
                enableResolve={
                  canSendFollowUp && !isAttemptRunning && isEditable
                }
                enableAbort={canSendFollowUp && !isAttemptRunning}
                conflictResolutionInstructions={conflictResolutionInstructions}
              />
            )}

            {/* Clicked elements notice and actions */}
            <ClickedElementsBanner />

            {/* Queued message indicator */}
            {isQueued && queuedMessage && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md border">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <div className="font-medium">
                  {t(
                    'followUp.queuedMessage',
                    'Message queued - will execute when current run finishes'
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <WYSIWYGEditor
                placeholder={editorPlaceholder}
                value={displayMessage}
                onChange={handleEditorChange}
                disabled={!isEditable}
                onPasteFiles={handlePasteFiles}
                repoIds={repos.map((r) => r.id)}
                projectId={projectId}
                executor={selectedExecutor ?? null}
                taskAttemptId={workspaceId}
                onCmdEnter={handleSubmitShortcut}
                className="min-h-[40px]"
                onFocus={() => setIsTextareaFocused(true)}
                onBlur={() => setIsTextareaFocused(false)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Always-visible action bar */}
      <div className="p-4" ref={actionBarRef}>
        <div className="flex flex-row gap-2 items-center">
          {!isAttemptRunning && (
            <div className="flex-1 flex gap-2">
              <AgentSelector
                profiles={profiles}
                selectedExecutorProfile={
                  selectedExecutor
                    ? { executor: selectedExecutor, variant: selectedVariant }
                    : null
                }
                onChange={(profile) => {
                  setSelectedExecutor(profile.executor);
                  // Reset variant when executor changes
                  if (profile.executor !== latestProfileId?.executor) {
                    setVariantFromHook(null);
                  }
                }}
                disabled={!isEditable}
                className="w-32"
              />
              <VariantSelector
                currentProfile={currentProfile}
                selectedVariant={selectedVariant}
                onChange={setSelectedVariant}
                disabled={!isEditable}
              />
            </div>
          )}

          {/* Hidden file input for attachment - always present */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {isCompact ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleAttachClick}
                  disabled={!isEditable}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {t('followUp.attachImage', 'Attach image')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handlePrCommentClick}
                  disabled={!isEditable}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('followUp.insertPrComment', 'Insert PR comment')}
                </DropdownMenuItem>
                {hasAnyScript && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleRunSetupScript}
                      disabled={isAttemptRunning}
                    >
                      <Terminal className="h-4 w-4 mr-2" />
                      {t('followUp.runSetupScript')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleRunCleanupScript}
                      disabled={isAttemptRunning}
                    >
                      <Terminal className="h-4 w-4 mr-2" />
                      {t('followUp.runCleanupScript')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              {/* Attach button */}
              <Button
                onClick={handleAttachClick}
                disabled={!isEditable}
                size="sm"
                variant="outline"
                title="Attach image"
                aria-label="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* PR Comments button */}
              <Button
                onClick={handlePrCommentClick}
                disabled={!isEditable}
                size="sm"
                variant="outline"
                title="Insert PR comment"
                aria-label="Insert PR comment"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>

              {/* Scripts dropdown - only show if project has any scripts */}
              {hasAnyScript && (
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isAttemptRunning}
                            aria-label="Run scripts"
                          >
                            <Terminal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      {isAttemptRunning && (
                        <TooltipContent side="bottom">
                          {t('followUp.scriptsDisabledWhileRunning')}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleRunSetupScript}>
                      {t('followUp.runSetupScript')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleRunCleanupScript}>
                      {t('followUp.runCleanupScript')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}

          {isAttemptRunning ? (
            <div className="flex items-center gap-2">
              {/* Queue/Cancel Queue button when running */}
              {isQueued ? (
                <Button
                  onClick={cancelQueue}
                  disabled={isQueueLoading}
                  size="sm"
                  variant="outline"
                >
                  {isQueueLoading ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      {t('followUp.cancelQueue', 'Cancel Queue')}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleQueueMessage}
                  disabled={
                    isQueueLoading ||
                    (!localMessage.trim() &&
                      !conflictResolutionInstructions &&
                      !reviewMarkdown &&
                      !clickedMarkdown)
                  }
                  size="sm"
                >
                  {isQueueLoading ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  ) : (
                    <>
                      <Clock className="h-4 w-4 mr-2" />
                      {t('followUp.queue', 'Queue')}
                    </>
                  )}
                </Button>
              )}
              {multiSelectState && multiSelectState.selections.size > 0 && (
                <Button
                  onClick={() => {
                    submitQuestionAnswer({
                      approvalId: multiSelectState.approvalId,
                      executionProcessId: multiSelectState.executionProcessId,
                      answers: [
                        {
                          question:
                            multiSelectState.questions[0]?.question ?? '',
                          answer: Array.from(multiSelectState.selections),
                        },
                      ],
                    });
                  }}
                  size="sm"
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {t('askQuestion.confirmSelection', 'Confirm selection')} (
                  {multiSelectState.selections.size})
                </Button>
              )}
              <Button
                onClick={stopExecution}
                disabled={isStopping}
                size="sm"
                variant="destructive"
              >
                {isStopping ? (
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <>
                    <StopCircle className="h-4 w-4 mr-2" />
                    {t('followUp.stop')}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {comments.length > 0 && (
                <Button
                  onClick={clearComments}
                  size="sm"
                  variant="destructive"
                  disabled={!isEditable}
                >
                  {t('followUp.clearReviewComments')}
                </Button>
              )}
              <Button
                onClick={() => {
                  if (
                    isInQuestionMode &&
                    pendingQuestionInfo &&
                    localMessage.trim()
                  ) {
                    submitQuestionAnswer({
                      approvalId: pendingQuestionInfo.approvalId,
                      executionProcessId:
                        pendingQuestionInfo.executionProcessId,
                      answers: [
                        {
                          question: pendingQuestionInfo.question,
                          answer: [localMessage.trim()],
                        },
                      ],
                    });
                    setLocalMessage('');
                  } else if (executorChanged) {
                    handleRetryToNewTask();
                  } else {
                    onSendFollowUp();
                  }
                }}
                disabled={
                  !canSendFollowUp || !isEditable || isRetryingToNewTask
                }
                size="sm"
              >
                {isSendingFollowUp || isRetryingToNewTask ? (
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {isInQuestionMode
                      ? 'Submit Answer'
                      : executorChanged
                        ? 'Retry to New Task'
                        : conflictResolutionInstructions
                          ? t('followUp.resolveConflicts')
                          : t('followUp.send')}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
