import { useEffect } from 'react';
import type { TabPersisted } from '@/lib/connections/types';

const APP_TITLE = 'vibe-board';

export function getTabDocumentTitle(
  activeTabId: string,
  tabs: TabPersisted[]
): string {
  if (activeTabId === 'home') return APP_TITLE;

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const label = activeTab?.label.trim();

  return label ? `${label} | ${APP_TITLE}` : APP_TITLE;
}

export function useTabDocumentTitle(
  activeTabId: string,
  tabs: TabPersisted[]
): void {
  useEffect(() => {
    document.title = getTabDocumentTitle(activeTabId, tabs);
  }, [activeTabId, tabs]);
}
