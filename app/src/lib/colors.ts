export const statusColors: Record<string, string> = {
  todo: 'var(--color-status-todo)',
  inprogress: 'var(--color-status-inprogress)',
  inreview: 'var(--color-status-inreview)',
  done: 'var(--color-status-done)',
  cancelled: 'var(--color-status-cancelled)',
};

export const statusLabels: Record<string, string> = {
  todo: 'Todo',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const statusBgClasses: Record<string, string> = {
  todo: 'bg-status-todo',
  inprogress: 'bg-status-inprogress',
  inreview: 'bg-status-inreview',
  done: 'bg-status-done',
  cancelled: 'bg-status-cancelled',
};
