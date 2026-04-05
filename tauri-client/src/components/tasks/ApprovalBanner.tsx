import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApprovalInfo } from '@shared/types';
import { useApprovalStream } from '@/api/hooks/useApprovalStream';
import { useRespondToApproval } from '@/api/hooks/useApprovals';
import { Button } from '@/components/ui/Button';
import { ShieldAlert, Check, X } from 'lucide-react';

interface ApprovalBannerProps {
  processIds: Set<string>;
}

function ApprovalCard({ approval }: { approval: ApprovalInfo }) {
  const { t } = useTranslation();
  const respond = useRespondToApproval();
  const [denied, setDenied] = useState(false);

  const handleApprove = () => {
    respond.mutate({
      id: approval.approval_id,
      outcome: { status: 'approved' },
    });
  };

  const handleDeny = () => {
    respond.mutate({
      id: approval.approval_id,
      outcome: {
        status: 'denied',
        reason: 'User denied this tool use request.',
      },
    });
    setDenied(true);
  };

  if (denied) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {approval.tool_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {approval.is_question
            ? t('approvals.questionAsked')
            : t('approvals.needsApproval')}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleApprove}
        disabled={respond.isPending}
        className="shrink-0 text-green-600 border-green-600/30"
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        {t('approvals.approve')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDeny}
        disabled={respond.isPending}
        className="shrink-0 text-destructive border-destructive/30"
      >
        <X className="h-3.5 w-3.5 mr-1" />
        {t('approvals.deny')}
      </Button>
    </div>
  );
}

export function ApprovalBanner({ processIds }: ApprovalBannerProps) {
  const { pendingApprovals } = useApprovalStream();

  const relevantApprovals = pendingApprovals.filter(
    (a) => processIds.has(a.execution_process_id),
  );

  if (relevantApprovals.length === 0) return null;

  return (
    <div className="border-b border-border bg-warning/5">
      {relevantApprovals.map((approval) => (
        <ApprovalCard key={approval.approval_id} approval={approval} />
      ))}
    </div>
  );
}
