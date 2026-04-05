import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Diff, DiffChangeKind } from '@shared/types';
import { ChevronDown, ChevronRight, Plus, Minus, FileText } from 'lucide-react';

interface DiffViewerProps {
  diffs: Diff[];
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLineNum: number | null;
  newLineNum: number | null;
  content: string;
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  if (oldLines.length === 0 && newLines.length === 0) return [];

  if (oldLines.length === 0) {
    return newLines.map((content, i) => ({
      type: 'add' as const,
      oldLineNum: null,
      newLineNum: i + 1,
      content,
    }));
  }

  if (newLines.length === 0) {
    return oldLines.map((content, i) => ({
      type: 'remove' as const,
      oldLineNum: i + 1,
      newLineNum: null,
      content,
    }));
  }

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Walk backwards to build operations
  const ops: DiffLine[] = [];
  let oi = m;
  let ni = n;
  while (oi > 0 || ni > 0) {
    if (oi > 0 && ni > 0 && oldLines[oi - 1] === newLines[ni - 1]) {
      ops.push({
        type: 'context',
        oldLineNum: oi,
        newLineNum: ni,
        content: oldLines[oi - 1],
      });
      oi--;
      ni--;
    } else if (ni > 0 && (oi === 0 || dp[oi][ni - 1] >= dp[oi - 1][ni])) {
      ops.push({
        type: 'add',
        oldLineNum: null,
        newLineNum: ni,
        content: newLines[ni - 1],
      });
      ni--;
    } else {
      ops.push({
        type: 'remove',
        oldLineNum: oi,
        newLineNum: null,
        content: oldLines[oi - 1],
      });
      oi--;
    }
  }
  ops.reverse();

  // Build result with proper remove/add pairing for modifications.
  // Strategy: collect consecutive removes, then consecutive adds,
  // pair them up (remove + add = modification), then emit remainder.
  const result: DiffLine[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type !== 'remove') {
      result.push(ops[i]);
      i++;
      continue;
    }

    // Collect removes
    const removeStart = i;
    while (i < ops.length && ops[i].type === 'remove') i++;
    const removeEnd = i;

    // Collect adds
    const addStart = i;
    while (i < ops.length && ops[i].type === 'add') i++;
    const addEnd = i;

    const removeCount = removeEnd - removeStart;
    const addCount = addEnd - addStart;
    const pairCount = Math.min(removeCount, addCount);

    // Emit paired (remove, add) lines — shows as a modification
    for (let j = 0; j < pairCount; j++) {
      result.push(ops[removeStart + j]);
      result.push(ops[addStart + j]);
    }
    // Remaining removes
    for (let j = pairCount; j < removeCount; j++) {
      result.push(ops[removeStart + j]);
    }
    // Remaining adds
    for (let j = pairCount; j < addCount; j++) {
      result.push(ops[addStart + j]);
    }
  }

  return result;
}

function changeBadgeStyle(change: DiffChangeKind): string {
  switch (change) {
    case 'added':
      return 'bg-green-500/15 text-green-600';
    case 'deleted':
      return 'bg-red-500/15 text-red-600';
    case 'modified':
      return 'bg-blue-500/15 text-blue-600';
    case 'renamed':
      return 'bg-yellow-500/15 text-yellow-600';
    case 'copied':
      return 'bg-purple-500/15 text-purple-600';
    case 'permissionChange':
      return 'bg-orange-500/15 text-orange-600';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function DiffFile({ diff }: { diff: Diff }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const filePath =
    diff.newPath ?? diff.oldPath ?? '(unknown)';
  const oldPath = diff.oldPath;

  const lines = useMemo((): DiffLine[] => {
    if (diff.change === 'added') {
      const newLines = (diff.newContent ?? '').split('\n');
      return newLines.map((content, i) => ({
        type: 'add' as const,
        oldLineNum: null,
        newLineNum: i + 1,
        content,
      }));
    }
    if (diff.change === 'deleted') {
      const oldLines = (diff.oldContent ?? '').split('\n');
      return oldLines.map((content, i) => ({
        type: 'remove' as const,
        oldLineNum: i + 1,
        newLineNum: null,
        content,
      }));
    }
    const oldLines = (diff.oldContent ?? '').split('\n');
    const newLines = (diff.newContent ?? '').split('\n');
    return computeDiff(oldLines, newLines);
  }, [diff]);

  const stats = useMemo(() => {
    let adds = 0;
    let removes = 0;
    for (const line of lines) {
      if (line.type === 'add') adds++;
      if (line.type === 'remove') removes++;
    }
    return { adds, removes };
  }, [lines]);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm bg-muted/30 active:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs">
          {filePath}
          {oldPath && oldPath !== filePath && (
            <span className="text-muted-foreground ml-1">
              (was {oldPath})
            </span>
          )}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${changeBadgeStyle(diff.change)}`}
        >
          {diff.change}
        </span>
        {stats.adds > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-green-600">
            <Plus className="h-3 w-3" />
            {stats.adds}
          </span>
        )}
        {stats.removes > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-red-600">
            <Minus className="h-3 w-3" />
            {stats.removes}
          </span>
        )}
      </button>

      {expanded && !diff.contentOmitted && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={idx}
                  className={
                    line.type === 'add'
                      ? 'bg-green-500/10'
                      : line.type === 'remove'
                        ? 'bg-red-500/10'
                        : ''
                  }
                >
                  <td className="px-2 py-0 text-right text-muted-foreground select-none w-10 border-r border-border/50">
                    {line.oldLineNum ?? ''}
                  </td>
                  <td className="px-2 py-0 text-right text-muted-foreground select-none w-10 border-r border-border/50">
                    {line.newLineNum ?? ''}
                  </td>
                  <td className="px-1 py-0 select-none w-5 text-center">
                    {line.type === 'add' ? (
                      <span className="text-green-600">+</span>
                    ) : line.type === 'remove' ? (
                      <span className="text-red-600">-</span>
                    ) : (
                      <span className="text-transparent"> </span>
                    )}
                  </td>
                  <td className="px-2 py-0 whitespace-pre">
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && diff.contentOmitted && (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          {t('git.contentOmitted')}
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ diffs }: DiffViewerProps) {
  const { t } = useTranslation();

  if (diffs.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('git.noChanges')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {diffs.map((diff, idx) => (
        <DiffFile key={`${diff.newPath ?? diff.oldPath ?? idx}`} diff={diff} />
      ))}
    </div>
  );
}
