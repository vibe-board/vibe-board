import type { Component } from 'solid-js';
import { Badge, StatusDot } from '@/components/ui/badge';
import { statusLabels } from '@/lib/colors';
import type { TaskStatus } from '@/api/types';

export const TaskStatusBadge: Component<{ status: TaskStatus }> = (props) => {
  return (
    <Badge variant="muted">
      <StatusDot status={props.status} />
      {statusLabels[props.status]}
    </Badge>
  );
};
