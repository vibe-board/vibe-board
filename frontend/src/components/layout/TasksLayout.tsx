import { ReactNode, useState } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type PanelSize,
} from 'react-resizable-panels';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LayoutMode = 'preview' | 'diffs' | null;

interface TasksLayoutProps {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  isPanelOpen: boolean;
  mode: LayoutMode;
  isMobile?: boolean;
  rightHeader?: ReactNode;
}

const MIN_PANEL_SIZE = 20; // percentage (0-100)
const COLLAPSED_SIZE = 0; // percentage (0-100)

/**
 * AuxRouter - Handles nested AnimatePresence for preview/diffs transitions.
 */
function AuxRouter({ mode, aux }: { mode: LayoutMode; aux: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode && (
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="h-full min-h-0"
        >
          {aux}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * RightWorkArea - Contains header and Attempt/Aux content.
 * Shows just Attempt when mode === null, or Attempt | Aux split when mode !== null.
 */
function RightWorkArea({
  attempt,
  aux,
  mode,
  rightHeader,
}: {
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
}) {
  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'tasksLayout-attemptAux',
    storage: localStorage,
  });
  const [isAttemptCollapsed, setIsAttemptCollapsed] = useState(false);

  const handleAttemptResize = (size: PanelSize) => {
    setIsAttemptCollapsed(size.asPercentage === COLLAPSED_SIZE);
  };

  const hasAux = mode !== null;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {rightHeader && (
        <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
          {rightHeader}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Group
          orientation="horizontal"
          className="h-full min-h-0"
          defaultLayout={defaultLayout}
          onLayoutChange={onLayoutChange}
        >
          <Panel
            id="attempt"
            defaultSize={hasAux ? 34 : 100}
            minSize={hasAux ? MIN_PANEL_SIZE : 100}
            collapsible={hasAux}
            collapsedSize={COLLAPSED_SIZE}
            onResize={handleAttemptResize}
            className="min-w-0 min-h-0 overflow-hidden"
            role="region"
            aria-label="Details"
          >
            {attempt}
          </Panel>

          {hasAux && (
            <>
              <Separator
                id="handle-aa"
                className={cn(
                  'relative z-30 bg-border cursor-col-resize group touch-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  'transition-all',
                  isAttemptCollapsed ? 'w-6' : 'w-1'
                )}
                aria-label="Resize panels"
              >
                <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
                <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                  <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                  <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                </div>
              </Separator>

              <Panel
                id="aux"
                defaultSize={66}
                minSize={MIN_PANEL_SIZE}
                className="min-w-0 min-h-0 overflow-hidden"
                role="region"
                aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
              >
                <AuxRouter mode={mode} aux={aux} />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}

/**
 * DesktopSimple - Renders Kanban + RightWorkArea in a stable tree structure.
 * When mode === null: Shows Kanban | Attempt (kanban visible with resizable split)
 * When mode !== null: Hides Kanban via CSS, RightWorkArea fills 100%
 *
 * IMPORTANT: RightWorkArea must always be at the same position in the React
 * tree so that VirtualizedList (and its IntersectionObserver / scroll state)
 * is never unmounted when the user toggles the diff panel.  We use CSS
 * display:none to hide the kanban rather than conditional rendering to
 * guarantee a stable component tree.
 */
function DesktopSimple({
  kanban,
  attempt,
  aux,
  mode,
  rightHeader,
}: {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
}) {
  const hasAux = mode !== null;

  // When aux (diff/preview) is open, hide kanban and show only RightWorkArea.
  // We always render RightWorkArea at the SAME tree position (second child)
  // so VirtualizedList is never unmounted on mode change.
  return (
    <div className="h-full min-h-0 flex flex-row">
      {/* Kanban area — hidden via CSS when aux panel is open so tree stays stable */}
      <div
        className={cn(
          'min-h-0',
          hasAux ? 'hidden' : 'flex-[2_1_0%] min-w-0 overflow-hidden'
        )}
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </div>

      {/* Separator — hidden when aux is open */}
      <div className={cn('shrink-0 bg-border', hasAux ? 'hidden' : 'w-1')} />

      {/* RightWorkArea — always rendered at this stable tree position */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <RightWorkArea
          attempt={attempt}
          aux={aux}
          mode={mode}
          rightHeader={rightHeader}
        />
      </div>
    </div>
  );
}

export function TasksLayout({
  kanban,
  attempt,
  aux,
  isPanelOpen,
  mode,
  isMobile = false,
  rightHeader,
}: TasksLayoutProps) {
  const desktopKey = isPanelOpen ? 'desktop-with-panel' : 'kanban-only';

  if (isMobile) {
    // When panel is open and mode is set, show aux content (preview/diffs)
    // Otherwise show attempt content
    const showAux = isPanelOpen && mode !== null;

    return (
      <div className="h-full min-h-0 flex flex-col">
        {/* Header is visible when panel is open */}
        {isPanelOpen && rightHeader && (
          <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
            {rightHeader}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {!isPanelOpen ? (
            kanban
          ) : showAux ? (
            <AuxRouter mode={mode} aux={aux} />
          ) : (
            attempt
          )}
        </div>
      </div>
    );
  }

  let desktopNode: ReactNode;

  if (!isPanelOpen) {
    desktopNode = (
      <div
        className="h-full min-h-0 min-w-0 overflow-hidden"
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </div>
    );
  } else {
    desktopNode = (
      <DesktopSimple
        kanban={kanban}
        attempt={attempt}
        aux={aux}
        mode={mode}
        rightHeader={rightHeader}
      />
    );
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={desktopKey}
        className="h-full min-h-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      >
        {desktopNode}
      </motion.div>
    </AnimatePresence>
  );
}
