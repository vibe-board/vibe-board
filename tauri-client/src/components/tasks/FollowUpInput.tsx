import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFollowUpSession } from '@/api/hooks/useSessions';
import type { ExecutorProfileId, DraftFollowUpData } from '@shared/types';
import { ScratchType } from '@shared/types';
import { useScratch } from '@/api/hooks/useScratch';
import { useSlashCommands } from '@/api/hooks/useSlashCommands';
import { Button } from '@/components/ui/Button';
import { Send } from 'lucide-react';

interface FollowUpInputProps {
  sessionId: string;
  executorProfileId: ExecutorProfileId;
  onSuccess?: () => void;
}

export function FollowUpInput({
  sessionId,
  executorProfileId,
  onSuccess,
}: FollowUpInputProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const followUp = useFollowUpSession();

  const { scratch, updateScratch, deleteScratch } = useScratch(
    ScratchType.DRAFT_FOLLOW_UP,
    sessionId,
  );

  const { commands: slashCommands } = useSlashCommands(
    executorProfileId.executor,
  );

  const filteredCommands = useMemo(() => {
    if (!prompt.startsWith('/')) return [];
    const query = prompt.slice(1).toLowerCase();
    return slashCommands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(query),
    );
  }, [prompt, slashCommands]);

  const showSlashDropdown = filteredCommands.length > 0;

  const handleSelectCommand = (name: string) => {
    setPrompt(`/${name} `);
    textareaRef.current?.focus();
  };

  // Restore draft on mount when scratch data arrives
  const hasRestoredDraft = useRef(false);
  useEffect(() => {
    if (hasRestoredDraft.current) return;
    const scratchData: DraftFollowUpData | undefined =
      scratch?.payload?.type === 'DRAFT_FOLLOW_UP'
        ? scratch.payload.data
        : undefined;
    if (scratchData?.message) {
      setPrompt(scratchData.message);
      hasRestoredDraft.current = true;
    }
  }, [scratch]);

  // Debounced draft save (500ms)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraft = useCallback(
    (text: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (text.trim()) {
          updateScratch({
            payload: {
              type: 'DRAFT_FOLLOW_UP',
              data: { message: text, executor_profile_id: executorProfileId },
            },
          }).catch(() => {});
        } else {
          deleteScratch().catch(() => {});
        }
      }, 500);
    },
    [updateScratch, deleteScratch, executorProfileId],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }
  }, [prompt]);

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed || followUp.isPending) return;

    followUp.mutate(
      {
        id: sessionId,
        body: {
          prompt: trimmed,
          executor_profile_id: executorProfileId,
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
          allow_executor_change: null,
        },
      },
      {
        onSuccess: () => {
          setPrompt('');
          deleteScratch().catch(() => {});
          onSuccess?.();
        },
      },
    );
  };

  return (
    <>
      {showSlashDropdown && (
        <div className="border-t border-border bg-background px-4 py-1">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.name}
              onClick={() => handleSelectCommand(cmd.name)}
              className="w-full text-left px-3 py-2 rounded-md active:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">
                /{cmd.name}
              </span>
              {cmd.description && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {cmd.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border bg-background">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            saveDraft(e.target.value);
          }}
          placeholder={t('tasks.followUpPlaceholder')}
          rows={1}
          className="flex-1 min-h-[44px] max-h-[240px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!prompt.trim() || followUp.isPending}
          aria-label={t('tasks.followUp')}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
