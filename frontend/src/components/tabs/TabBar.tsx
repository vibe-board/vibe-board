// frontend/src/components/tabs/TabBar.tsx
import { useCallback } from 'react';
import { X, Home, Plus } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useConnectionStore();

  const handleAddClick = useCallback(() => {
    setActiveTab('home');
  }, [setActiveTab]);

  return (
    <div
      className="flex items-center border-b border-border bg-muted/50 overflow-x-auto"
      style={{ minHeight: '36px' }}
    >
      {/* Home tab — always first, not closable */}
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-border whitespace-nowrap shrink-0 transition-colors ${
          activeTabId === 'home'
            ? 'bg-background text-foreground'
            : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
        }`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={13} />
        Home
      </button>

      {/* Project tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1 px-3 py-1.5 text-xs border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            activeTabId === tab.id
              ? 'bg-background text-foreground font-medium'
              : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
          }`}
          onClick={() => setActiveTab(tab.id)}
          title={tab.label}
        >
          <span className="max-w-[160px] truncate">{tab.label}</span>
          <button
            className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add button — switches to Home tab */}
      <button
        className="flex items-center justify-center px-2 py-1.5 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
        onClick={handleAddClick}
        title="New tab (go to Home)"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
