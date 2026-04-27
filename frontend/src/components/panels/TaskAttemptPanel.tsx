import type { Task } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { TOCDrawer } from '@/components/logs/TOCDrawer';
import { List } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

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
  const jumpToRef = useRef<
    | ((
        anchorCursor: string,
        processId: string,
        allSummaries: Array<{
          execution_process_id: string;
          summary: string;
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
                <button
                  onClick={() => setTocOpen(true)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  title="Conversation TOC"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <VirtualizedList
                key={attempt.id}
                attempt={attempt}
                task={task}
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
