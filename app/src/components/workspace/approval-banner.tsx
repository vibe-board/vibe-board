import type { Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldX } from 'lucide-solid';
import type { ApprovalInfo } from '@/api/types';

export const ApprovalBanner: Component<{
  approval: ApprovalInfo;
  onApprove: () => void;
  onDeny: () => void;
}> = (props) => {
  return (
    <div class="flex items-center gap-3 p-3 rounded-lg bg-status-inprogress/10 border border-status-inprogress/20">
      <div class="flex-1">
        <div class="text-sm font-medium text-foreground">
          Approval Required
        </div>
        <div class="text-xs text-muted mt-0.5">{props.approval.tool_name}</div>
      </div>
      <Button size="sm" variant="outline" onClick={props.onDeny}>
        <ShieldX class="h-3.5 w-3.5" /> Deny
      </Button>
      <Button size="sm" onClick={props.onApprove}>
        <ShieldCheck class="h-3.5 w-3.5" /> Approve
      </Button>
    </div>
  );
};
