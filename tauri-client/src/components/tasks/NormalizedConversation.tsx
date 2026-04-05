import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { NormalizedEntry, NormalizedEntryType } from '@shared/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

interface NormalizedConversationProps {
  entries: NormalizedEntry[];
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function getEntryTypeLabel(
  entryType: NormalizedEntryType,
  t: (key: string) => string,
): string | null {
  if (!isValidEntryType(entryType)) return null;

  if (typeof entryType === 'string') {
    switch (entryType) {
      case 'user_message':
        return null;
      case 'assistant_message':
        return null;
      case 'system_message':
        return null;
      case 'thinking':
        return t('tasks.thinking');
      case 'loading':
        return null;
      default:
        return null;
    }
  }

  const type = entryType.type;
  switch (type) {
    case 'tool_use':
      return `${entryType.tool_name ?? 'Tool'}`;
    case 'error_message':
      return t('common.error');
    case 'next_action':
      return entryType.failed ? t('tasks.failed') : null;
    case 'token_usage_info':
      return null;
    case 'task_duration':
      return null;
    case 'user_feedback':
      return entryType.denied_tool ? t('tasks.toolDenied') : null;
    case 'user_answered_questions':
      return null;
    default:
      return null;
  }
}

function isValidEntryType(entryType: unknown): entryType is NormalizedEntryType {
  if (typeof entryType === 'string') return true;
  return typeof entryType === 'object' && entryType !== null && 'type' in entryType;
}

function isUserEntry(entryType: NormalizedEntryType): boolean {
  if (typeof entryType === 'string') {
    return entryType === 'user_message';
  }
  return entryType.type === 'user_message';
}

function isSystemEntry(entryType: NormalizedEntryType): boolean {
  if (typeof entryType === 'string') {
    return entryType === 'system_message';
  }
  return entryType.type === 'system_message';
}

function isErrorEntry(entryType: NormalizedEntryType): boolean {
  if (typeof entryType === 'object' && 'type' in entryType) {
    return entryType.type === 'error_message';
  }
  return false;
}

function isToolEntry(entryType: NormalizedEntryType): boolean {
  if (typeof entryType === 'object' && 'type' in entryType) {
    return entryType.type === 'tool_use';
  }
  return false;
}

function isTokenUsageEntry(entryType: NormalizedEntryType): boolean {
  return (
    typeof entryType === 'object' &&
    'type' in entryType &&
    entryType.type === 'token_usage_info'
  );
}

function isTaskDurationEntry(entryType: NormalizedEntryType): boolean {
  return (
    typeof entryType === 'object' &&
    'type' in entryType &&
    entryType.type === 'task_duration'
  );
}

function isNextActionEntry(entryType: NormalizedEntryType): boolean {
  return (
    typeof entryType === 'object' &&
    'type' in entryType &&
    entryType.type === 'next_action'
  );
}

// ── Expandable Tool Result ─────────────────────────────────────────────────

function ToolEntryBubble({
  entry,
}: {
  entry: NormalizedEntry & { entry_type: { type: string; tool_name?: string } };
}) {
  const [expanded, setExpanded] = useState(true);
  const label = entry.entry_type.tool_name ?? 'Tool';
  const hasContent = !!entry.content && entry.content.trim().length > 0;

  return (
    <div className="flex justify-start my-1">
      <div className="bg-accent/50 border border-border rounded-lg max-w-[90%] overflow-hidden">
        <button
          onClick={() => hasContent && setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-3 py-2 w-full text-left"
          disabled={!hasContent}
        >
          {hasContent && (
            <span className="shrink-0">
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </button>
        {expanded && hasContent && (
          <div className="px-3 pb-2 border-t border-border/50">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words mt-2">
              {entry.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Token Usage ────────────────────────────────────────────────────────────

function TokenUsageBubble({ entry }: { entry: NormalizedEntry }) {
  let tokens: number | null = null;
  let cost: number | null = null;

  if (
    typeof entry.entry_type === 'object' &&
    'type' in entry.entry_type &&
    entry.entry_type.type === 'token_usage_info'
  ) {
    const et = entry.entry_type as Record<string, unknown>;
    tokens = (et.total_tokens as number) ?? null;
    cost = (et.total_cost as number) ?? null;
  }

  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full">
        {tokens != null && (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {tokens.toLocaleString()} tokens
          </span>
        )}
        {cost != null && cost > 0 && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            ${cost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Task Duration ──────────────────────────────────────────────────────────

function TaskDurationBubble({ entry }: { entry: NormalizedEntry }) {
  let duration: string | null = null;

  if (
    typeof entry.entry_type === 'object' &&
    'type' in entry.entry_type &&
    entry.entry_type.type === 'task_duration'
  ) {
    const et = entry.entry_type as Record<string, unknown>;
    const ms = et.duration_ms as number | undefined;
    if (ms != null) {
      const secs = Math.round(ms / 1000);
      if (secs < 60) duration = `${secs}s`;
      else if (secs < 3600)
        duration = `${Math.floor(secs / 60)}m ${secs % 60}s`;
      else
        duration = `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    }
  }

  if (!duration) return null;

  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full">
        <Clock className="h-3 w-3" />
        {duration}
      </div>
    </div>
  );
}

// ── Next Action ────────────────────────────────────────────────────────────

function NextActionBubble({ entry }: { entry: NormalizedEntry }) {
  let failed = false;

  if (
    typeof entry.entry_type === 'object' &&
    'type' in entry.entry_type &&
    entry.entry_type.type === 'next_action'
  ) {
    const et = entry.entry_type as Record<string, unknown>;
    failed = !!et.failed;
  }

  if (!failed) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 px-3 py-1.5 rounded-full">
          <CheckCircle className="h-3 w-3" />
          {entry.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start my-2">
      <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-full">
        <AlertTriangle className="h-3 w-3" />
        {entry.content}
      </div>
    </div>
  );
}

// ── Markdown Renderer ──────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !String(children).includes('\n');
          if (isInline) {
            return (
              <code className="text-xs bg-background/50 px-1 py-0.5 rounded" {...props}>
                {children}
              </code>
            );
          }
          return (
            <SyntaxHighlighter
              style={oneDark}
              language={match?.[1] || 'text'}
              PreTag="div"
              customStyle={{
                margin: '0.5em 0',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                padding: '0.75em',
                overflowX: 'auto',
                maxWidth: '100%',
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        p({ children }) {
          return <p className="mb-1 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-4 mb-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-4 mb-1">{children}</ol>;
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse border border-border">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border border-border px-2 py-1 bg-muted/50 font-medium">{children}</th>;
        },
        td({ children }) {
          return <td className="border border-border px-2 py-1">{children}</td>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── System Message Card ──────────────────────────────────────────────────

function SystemMessageCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-center my-2">
      <div className="bg-muted/50 border border-border rounded-lg max-w-[90%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-3 py-2 w-full text-left"
        >
          <span className="shrink-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Context Summary
          </span>
        </button>
        {expanded && (
          <div className="px-3 pb-2 border-t border-border/50">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Error Entry (collapsible) ──────────────────────────────────────────────

function ErrorEntryBubble({
  entry,
  label,
}: {
  entry: NormalizedEntry;
  label: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length >= 80;

  if (!isLong) {
    return (
      <div className="flex justify-start my-2">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 max-w-[85%]">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <p className="text-sm text-destructive whitespace-pre-wrap break-words">
              {entry.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const firstLine = entry.content.split('\n')[0];

  return (
    <div className="flex justify-start my-2">
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg max-w-[85%] overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-3 py-2 w-full text-left"
        >
          <span className="shrink-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-destructive" />
            )}
          </span>
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive truncate">
            {label ?? firstLine}
          </span>
        </button>
        {expanded && (
          <div className="px-3 pb-2 border-t border-destructive/20">
            <p className="text-sm text-destructive whitespace-pre-wrap break-words mt-2">
              {entry.content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Entry Bubble ───────────────────────────────────────────────────────────

function EntryBubble({ entry }: { entry: NormalizedEntry }) {
  const { t } = useTranslation();

  // Guard against malformed entries from WS patches
  if (!isValidEntryType(entry.entry_type)) {
    return null;
  }

  const isUser = isUserEntry(entry.entry_type);
  const isSystem = isSystemEntry(entry.entry_type);
  const isError = isErrorEntry(entry.entry_type);
  const isTool = isToolEntry(entry.entry_type);
  const isTokenUsage = isTokenUsageEntry(entry.entry_type);
  const isTaskDuration = isTaskDurationEntry(entry.entry_type);
  const isNextAction = isNextActionEntry(entry.entry_type);
  const label = getEntryTypeLabel(entry.entry_type, t);

  if (isSystem) {
    const isLong = entry.content.length >= 100;
    if (!isLong) {
      return (
        <div className="flex justify-center my-2">
          <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
            {entry.content}
          </span>
        </div>
      );
    }
    return <SystemMessageCard content={entry.content} />;
  }

  if (isTokenUsage) return <TokenUsageBubble entry={entry} />;
  if (isTaskDuration) return <TaskDurationBubble entry={entry} />;
  if (isNextAction) return <NextActionBubble entry={entry} />;

  if (isError) {
    return <ErrorEntryBubble entry={entry} label={label} />;
  }

  if (isTool) {
    return (
      <ToolEntryBubble
        entry={
          entry as NormalizedEntry & {
            entry_type: { type: string; tool_name?: string };
          }
        }
      />
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end my-2">
        <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap break-words">
            {entry.content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message — render with markdown
  return (
    <div className="flex justify-start my-2">
      <div className="bg-muted rounded-lg px-3 py-2 max-w-[85%] overflow-hidden">
        {label && (
          <span className="text-xs text-muted-foreground font-medium block mb-1">
            {label}
          </span>
        )}
        <MarkdownRenderer content={entry.content} />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function NormalizedConversation({
  entries,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: NormalizedConversationProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(entries.length);
  const loadMoreTriggeredRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Auto-scroll to bottom on new entries
  if (entries.length > prevLengthRef.current) {
    const scrollEl = parentRef.current;
    if (scrollEl) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
      });
    }
    prevLengthRef.current = entries.length;
  }

  // Detect scroll-to-top for load-more
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || !hasMore || isLoadingMore || !onLoadMore) return;
    if (el.scrollTop < 100 && !loadMoreTriggeredRef.current) {
      loadMoreTriggeredRef.current = true;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Reset the trigger when loading finishes
  if (!isLoadingMore) {
    loadMoreTriggeredRef.current = false;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title={t('tasks.noConversation')}
        description={t('tasks.noConversationHint')}
      />
    );
  }

  return (
    <>
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <LoadingSpinner />
        </div>
      )}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            if (!entry) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <EntryBubble entry={entry} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
