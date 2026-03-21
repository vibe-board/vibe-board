import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk';
import { LayoutDashboard, FolderKanban, Settings, Server } from 'lucide-react';
import { useUIStore } from '@/lib/store/uiStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { useProjectStore } from '@/lib/store/projectStore';

export function CommandPalette() {
  const navigate = useNavigate();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const servers = useConnectionStore((s) => s.servers);
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const navigateTo = (path: string) => {
    navigate(path);
    setCommandPaletteOpen(false);
  };

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      className="rounded border border-border bg-surface-overlay shadow-2xl"
    >
      <CommandInput
        placeholder="Type a command or search..."
        className="border-b border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary"
      />
      <CommandList className="max-h-[300px] overflow-y-auto p-2">
        <CommandEmpty className="py-6 text-center text-sm text-text-tertiary">
          No results found.
        </CommandEmpty>

        <CommandGroup heading="Navigation" className="text-xs text-text-tertiary">
          <CommandItem
            onSelect={() => navigateTo('/')}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-raised aria-selected:text-text-primary"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem
            onSelect={() => navigateTo('/settings')}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-raised aria-selected:text-text-primary"
          >
            <Settings className="h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        {servers.length > 0 && (
          <CommandGroup heading="Servers" className="text-xs text-text-tertiary">
            {servers.map((server) => (
              <CommandItem
                key={server.id}
                onSelect={() => navigateTo(`/servers/${server.id}/projects`)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-raised aria-selected:text-text-primary"
              >
                <Server className="h-4 w-4" />
                {server.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {projects.length > 0 && (
          <CommandGroup heading="Projects" className="text-xs text-text-tertiary">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                onSelect={() =>
                  navigateTo(
                    `/servers/default/projects/${project.id}/board`
                  )
                }
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-raised aria-selected:text-text-primary"
              >
                <FolderKanban className="h-4 w-4" />
                {project.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
