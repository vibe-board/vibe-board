import { createSignal } from 'solid-js';

const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);
const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);

export function useUIStore() {
  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed(prev => !prev),
    commandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette: () => setCommandPaletteOpen(prev => !prev),
  };
}
