import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';

interface BranchInfoBarProps {
  branch: string;
  targetBranch?: string;
  hasConflict?: boolean;
  onPress?: () => void;
}

export function BranchInfoBar({
  branch,
  targetBranch,
  hasConflict = false,
  onPress,
}: BranchInfoBarProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onPress}
      disabled={!onPress}
      className={`
        flex items-center gap-2 px-4 py-2.5 w-full text-left
        border-b border-border bg-muted/30
        ${onPress ? 'active:bg-muted/60 transition-colors' : ''}
      `}
    >
      <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{branch}</span>
          {hasConflict && (
            <span className="text-xs text-destructive font-medium">
              {t('common.error')}
            </span>
          )}
        </div>
        {targetBranch && (
          <span className="text-xs text-muted-foreground">
            {t('tasks.targetBranch')}: {targetBranch}
          </span>
        )}
      </div>
    </button>
  );
}
