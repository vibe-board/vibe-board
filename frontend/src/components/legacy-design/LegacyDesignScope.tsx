import { ReactNode, useState } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import { ActiveConnectionBridge } from './ActiveConnectionBridge';
import '@/styles/legacy/index.css';
import 'streamdown/styles.css';

interface LegacyDesignScopeProps {
  children: ReactNode;
}

export function LegacyDesignScope({ children }: LegacyDesignScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div ref={setContainer} className="legacy-design min-h-screen">
      {container && (
        <PortalContainerContext.Provider value={container}>
          <ActiveConnectionBridge>{children}</ActiveConnectionBridge>
        </PortalContainerContext.Provider>
      )}
    </div>
  );
}
