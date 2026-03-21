import { type Component } from 'solid-js';
import { KanbanBoard } from '@/components/kanban/board';

const ProjectBoardPage: Component = () => {
  return (
    <div class="h-full">
      <KanbanBoard />
    </div>
  );
};

export default ProjectBoardPage;
