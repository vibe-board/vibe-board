import type { Task, SessionWithCost } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { TOCDrawer } from '@/components/logs/TOCDrawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DollarSign, ChevronDown, List } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useEntries } from '@/contexts/EntriesContext';

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
      <PopoverContent className="w-64" align="end">
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

interface Agent {
  id: string | null;
  label: string;
}

const AgentTabBar = ({
  agents,
  activeAgentId,
  onSelect,
}: {
  agents: Agent[];
  activeAgentId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  if (agents.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0 overflow-x-auto">
      {agents.map((agent) => (
        <button
          key={agent.id ?? '__main__'}
          onClick={() => onSelect(agent.id)}
          className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
            activeAgentId === agent.id
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {agent.label}
        </button>
      ))}
    </div>
  );
};

const AgentTabBarConnected = ({
  activeAgentId,
  onSelect,
}: {
  activeAgentId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const { entries } = useEntries();

  const agents: Agent[] = useMemo(() => {
    const subagents: Agent[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      if (
        entry.type === 'NORMALIZED_ENTRY' &&
        entry.content.entry_type.type === 'subagent_started' &&
        !seen.has(entry.content.entry_type.actor_id)
      ) {
        seen.add(entry.content.entry_type.actor_id);
        const raw =
          entry.content.entry_type.description ??
          entry.content.entry_type.actor_id;
        const label = raw.length > 20 ? raw.slice(0, 20) + '\u2026' : raw;
        subagents.push({ id: entry.content.entry_type.actor_id, label });
      }
    }
    return [{ id: null, label: 'Main' }, ...subagents];
  }, [entries]);

  return (
    <AgentTabBar
      agents={agents}
      activeAgentId={activeAgentId}
      onSelect={onSelect}
    />
  );
};

interface TaskAttemptPanelProps {
  attempt: WorkspaceWithSession | undefined;
  task: Task | null;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
}

const TaskAttemptPanel = ({
  attempt,
  task,
  children,
}: TaskAttemptPanelProps) => {
  const [tocOpen, setTocOpen] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const jumpToRef = useRef<
    | ((
        anchorCursor: string,
        processId: string,
        allSummaries: Array<{
          execution_process_id: string;
          summary: string;
          full_prompt: string;
        }>
      ) => Promise<void>)
    | null
  >(null);

  if (!attempt) {
    return <div className="p-6 text-muted-foreground">Loading attempt...</div>;
  }

  if (!task) {
    return <div className="p-6 text-muted-foreground">Loading task...</div>;
  }

  return (
    <EntriesProvider key={attempt.id}>
      <RetryUiProvider attemptId={attempt.id}>
        {children({
          logs: (
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-end px-2 py-1 border-b border-border shrink-0">
                {attempt.session && <SessionCost session={attempt.session} />}
                <button
                  onClick={() => setTocOpen(true)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  title="Conversation TOC"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <AgentTabBarConnected
                activeAgentId={activeAgentId}
                onSelect={setActiveAgentId}
              />
              <VirtualizedList
                key={attempt.id}
                attempt={attempt}
                task={task}
                activeAgentId={activeAgentId}
                onJumpToReady={(fn) => {
                  jumpToRef.current = fn;
                }}
                onVisibleProcessIdChange={setActiveProcessId}
              />
              <TOCDrawer
                sessionId={attempt.session?.id}
                isOpen={tocOpen}
                onClose={() => setTocOpen(false)}
                onJumpTo={(anchorCursor, processId, allSummaries) => {
                  jumpToRef.current?.(anchorCursor, processId, allSummaries);
                }}
                activeProcessId={activeProcessId}
              />
            </div>
          ),
          followUp: (
            <TaskFollowUpSection
              key={attempt.id}
              task={task}
              session={attempt.session}
            />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskAttemptPanel;
