import { useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { TaskCard } from '@/components/tasks/TaskCard';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import { cn } from '@/lib/utils';
import type { KanbanColumns } from '@/components/tasks/TaskKanbanBoard';

const VISIBLE_STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
];

interface SwipeableKanbanProps {
  columns: KanbanColumns;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  selectedTaskId?: string;
  projectId: string;
}

export function SwipeableKanban({
  columns,
  onViewTaskDetails,
  selectedTaskId,
  projectId,
}: SwipeableKanbanProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  // Register onSelect callback
  useState(() => {
    if (emblaApi) {
      emblaApi.on('select', onSelect);
      return () => {
        emblaApi.off('select', onSelect);
      };
    }
  });

  return (
    <div className="flex flex-col h-full">
      {/* Dot indicator + column label */}
      <div className="flex items-center justify-center gap-1.5 py-2 border-b">
        {VISIBLE_STATUSES.map((status, i) => (
          <button
            key={status}
            onClick={() => emblaApi?.scrollTo(i)}
            className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full transition-transform',
                statusBoardColors[status],
                i === selectedIndex ? 'scale-125' : 'opacity-50'
              )}
            />
            <span
              className={cn(
                'text-xs transition-opacity',
                i === selectedIndex
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hidden'
              )}
            >
              {statusLabels[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Carousel */}
      <div className="flex-1 min-h-0 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {VISIBLE_STATUSES.map((status) => {
            const tasks = columns[status] ?? [];
            return (
              <div
                key={status}
                className="flex-[0_0_100%] min-w-0 h-full overflow-y-auto px-3 py-2"
              >
                {tasks.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm mt-8">
                    No {statusLabels[status].toLowerCase()} tasks
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task, index) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        index={index}
                        status={status}
                        onViewDetails={onViewTaskDetails}
                        isOpen={selectedTaskId === task.id}
                        projectId={projectId}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
