import { useEffect, useRef, useState } from 'react';
import { List, X } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { UserMessageSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TOCDrawerProps {
  sessionId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onJumpTo: (
    anchorCursor: string,
    processId: string,
    allSummaries: Array<{ execution_process_id: string; summary: string }>
  ) => void;
  activeProcessId: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function TOCDrawer({
  sessionId,
  isOpen,
  onClose,
  onJumpTo,
  activeProcessId,
}: TOCDrawerProps) {
  const { executionProcessesApi } = useApi();
  const [messages, setMessages] = useState<UserMessageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const activeRef = useRef<HTMLButtonElement>(null);
  const cachedSessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    if (cachedSessionIdRef.current === sessionId && messages.length > 0) return;

    setLoading(true);
    executionProcessesApi
      .getUserMessages(sessionId)
      .then((result) => {
        setMessages(result);
        cachedSessionIdRef.current = sessionId;
      })
      .catch((err) => {
        console.debug('Failed to load TOC messages:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, sessionId, executionProcessesApi, messages.length]);

  useEffect(() => {
    if (isOpen && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isOpen, activeProcessId]);

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border z-20 flex flex-col shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <List className="h-4 w-4" />
          Conversation TOC
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8 text-muted-foreground text-sm">
            Loading...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex justify-center py-8 text-muted-foreground text-sm">
            No messages
          </div>
        )}
        {messages.map((msg) => {
          const isActive = msg.execution_process_id === activeProcessId;
          return (
            <button
              key={msg.execution_process_id}
              ref={isActive ? activeRef : undefined}
              onClick={() => {
                onJumpTo(
                  msg.anchor_cursor,
                  msg.execution_process_id,
                  messages.map((m) => ({
                    execution_process_id: m.execution_process_id,
                    summary: m.summary,
                  }))
                );
                onClose();
              }}
              className={cn(
                'w-full text-left px-3 py-2 border-b border-border hover:bg-muted transition-colors',
                isActive && 'bg-muted'
              )}
            >
              <div className="text-sm text-foreground truncate">
                {msg.summary}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatRelativeTime(msg.created_at)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
