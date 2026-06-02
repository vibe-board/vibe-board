import { useState, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface TabErrorBoundaryProps {
  /** Stable per-tab key (tab.id or 'home'); used to scope the boundary + remount. */
  tabKey: string;
  /** Optional tab label shown in the fallback. */
  label?: string;
  children: ReactNode;
}

/**
 * Per-tab error boundary. One tab throwing must NOT take down the other tabs or
 * the Home tab (they are all mounted simultaneously under a single root boundary).
 *
 * On "Reload tab" we both resetError() AND bump a child key, because resetError
 * alone re-renders the still-broken subtree without remounting it.
 */
export function TabErrorBoundary({
  tabKey,
  label,
  children,
}: TabErrorBoundaryProps) {
  const [resetSeq, setResetSeq] = useState(0);

  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => {
        scope.setTag('tab_id', tabKey);
      }}
      fallback={({ resetError }) => (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-3 max-w-sm px-6">
            <p className="text-destructive text-sm font-medium">
              This tab crashed
            </p>
            <p className="text-foreground/60 text-xs">
              {label
                ? `"${label}" ran into an error.`
                : 'This tab ran into an error.'}{' '}
              Other tabs are unaffected.
            </p>
            <button
              className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-85"
              onClick={() => {
                resetError();
                setResetSeq((n) => n + 1);
              }}
            >
              Reload tab
            </button>
          </div>
        </div>
      )}
    >
      <div key={`${tabKey}:${resetSeq}`} className="h-full">
        {children}
      </div>
    </Sentry.ErrorBoundary>
  );
}
