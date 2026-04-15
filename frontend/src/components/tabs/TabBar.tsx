// frontend/src/components/tabs/TabBar.tsx
import { useCallback } from 'react';
import { X, Home, Plus, Monitor } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useConnectionStore();

  const handleAddClick = useCallback(() => {
    setActiveTab('home');
  }, [setActiveTab]);

  return (
    <div
      className="flex items-center border-b border-border bg-muted/50 overflow-x-auto"
      style={{ minHeight: '42px' }}
    >
      {/* Home tab — always first, not closable */}
      <button
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-r border-border whitespace-nowrap shrink-0 transition-colors ${
          activeTabId === 'home'
            ? 'bg-background text-foreground'
            : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
        }`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={16} />
        Home
      </button>

      {/* Tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1.5 px-4 py-2 text-sm border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            activeTabId === tab.id
              ? 'bg-background text-foreground font-medium'
              : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
          }`}
          onClick={() => setActiveTab(tab.id)}
          title={tab.label}
        >
          {tab.type === 'machine-projects' && (
            <Monitor size={14} className="shrink-0 text-foreground/50" />
          )}
          <span className="max-w-[180px] truncate">{tab.label}</span>
          <button
            className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Add button — switches to Home tab */}
      <button
        className="flex items-center justify-center px-3 py-2 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
        onClick={handleAddClick}
        title="New tab (go to Home)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
