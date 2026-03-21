import { useNavigate, useParams } from 'react-router-dom';
import { Search, ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/lib/store/uiStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { useProjectStore } from '@/lib/store/projectStore';

export function TopBar() {
  const navigate = useNavigate();
  const { serverId, projectId } = useParams();
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const servers = useConnectionStore((s) => s.servers);
  const projects = useProjectStore((s) => s.projects);

  const server = servers.find((s) => s.id === serverId);
  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-surface-raised px-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm text-text-secondary">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 hover:text-text-primary"
        >
          <Home className="h-4 w-4" />
        </button>
        {server && (
          <>
            <ChevronRight className="h-3 w-3 text-text-tertiary" />
            <button
              onClick={() => navigate(`/servers/${serverId}/projects`)}
              className="hover:text-text-primary"
            >
              {server.name}
            </button>
          </>
        )}
        {project && (
          <>
            <ChevronRight className="h-3 w-3 text-text-tertiary" />
            <span className="text-text-primary">{project.name}</span>
          </>
        )}
      </div>

      {/* Search */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-text-tertiary"
        onClick={toggleCommandPalette}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-surface-raised px-1.5 font-mono text-[10px] font-medium text-text-tertiary sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
    </div>
  );
}
