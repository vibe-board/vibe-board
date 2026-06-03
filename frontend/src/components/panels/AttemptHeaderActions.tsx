import { useTranslation } from 'react-i18next';
import {
  DollarSign,
  ChevronDown,
  Eye,
  FileDiff,
  GitCommitHorizontal,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { LayoutMode } from '../layout/TasksLayout';
import type { Task, SessionWithCost } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { usePostHog } from 'posthog-js/react';
import { WorkspaceWithSession } from '@/types/attempt';

const formatCost = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;

const formatTokens = (n: number) => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
};

const SessionCost = ({ session }: { session: SessionWithCost }) => {
  if (!session.total_cost_usd || session.total_cost_usd <= 0) return null;

  const totalTokens =
    Number(session.total_input_tokens ?? 0) +
    Number(session.total_output_tokens ?? 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted">
          <DollarSign className="h-3 w-3" />
          <span className="font-medium">
            {formatCost(session.total_cost_usd)}
          </span>
          <span className="opacity-50">|</span>
          <span>{formatTokens(totalTokens)} tokens</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 bg-background border shadow-md"
        align="end"
      >
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost by Model
          </div>
          {session.model_breakdown.map((m) => (
            <div key={m.model_name} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate">{m.model_name}</span>
                <span className="text-muted-foreground">
                  {formatCost(m.cost_usd)}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground pl-0">
                <span>in: {formatTokens(Number(m.input_tokens))}</span>
                <span>out: {formatTokens(Number(m.output_tokens))}</span>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: Task;
  attempt?: WorkspaceWithSession | null;
  isDirect?: boolean;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
  isDirect,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
        <TooltipProvider>
          <ToggleGroup
            type="single"
            value={mode ?? ''}
            onValueChange={(v) => {
              const newMode = (v as LayoutMode) || null;

              // Track view navigation
              if (newMode === 'preview') {
                posthog?.capture('preview_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === 'diffs') {
                posthog?.capture('diffs_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === 'commits') {
                posthog?.capture('commits_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === null) {
                // Closing the view (clicked active button)
                posthog?.capture('view_closed', {
                  trigger: 'button',
                  from_view: mode ?? 'attempt',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              }

              onModeChange(newMode);
            }}
            className="inline-flex gap-4"
            aria-label="Layout mode"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="preview"
                  aria-label="Preview"
                  active={mode === 'preview'}
                >
                  <Eye className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.preview')}
              </TooltipContent>
            </Tooltip>

            {!isDirect && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="diffs"
                    aria-label="Diffs"
                    active={mode === 'diffs'}
                  >
                    <FileDiff className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.diffs')}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="commits"
                  aria-label="Commits"
                  active={mode === 'commits'}
                >
                  <GitCommitHorizontal className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.commits', 'Commits')}
              </TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      )}
      {attempt?.session && <SessionCost session={attempt.session} />}
      <ActionsDropdown task={task} attempt={attempt} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
