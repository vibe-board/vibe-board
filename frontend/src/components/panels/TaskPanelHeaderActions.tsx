import { Button } from '../ui/button';
import { X } from 'lucide-react';
import type { Task } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';

interface TaskPanelHeaderActionsProps {
  task: Task;
  onClose: () => void;
}

export const TaskPanelHeaderActions = ({
  task,
  onClose,
}: TaskPanelHeaderActionsProps) => {
  return (
    <>
      <ActionsDropdown task={task} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
