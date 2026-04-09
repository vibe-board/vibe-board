import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useCallback } from 'react';
import { siDiscord } from 'simple-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderOpen,
  Settings,
  BookOpen,
  MessageCircleQuestion,
  MessageCircle,
  Menu,
  Plus,
  LogOut,
  LogIn,
  Monitor,
  ArrowLeftRight,
  SquareTerminal,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { SearchBar } from '@/components/SearchBar';
import { useSearch } from '@/contexts/SearchContext';
import { openTaskForm } from '@/lib/openTaskForm';
import { useProject } from '@/contexts/ProjectContext';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { OpenInIdeButton } from '@/components/ide/OpenInIdeButton';
import { useProjectRepos } from '@/hooks';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { oauthApi } from '@/lib/api';
import { useGateway } from '@/contexts/GatewayContext';
import { cn } from '@/lib/utils';
import { useTerminalDrawer } from '@/contexts/TerminalDrawerContext';
import { useHomeDir } from '@/hooks/useHomeDir';

const INTERNAL_NAV = [
  { label: 'Projects', icon: FolderOpen, to: '/local-projects' },
];

const EXTERNAL_LINKS = [
  {
    label: 'Docs',
    icon: BookOpen,
    href: 'https://vibeboard.cloud/docs',
  },
  {
    label: 'Support',
    icon: MessageCircleQuestion,
    href: 'https://github.com/vibe-board/vibe-board/issues',
  },
  {
    label: 'Discord',
    icon: MessageCircle,
    href: 'https://discord.gg/AC4nwVtJM3',
  },
];

function NavDivider() {
  return (
    <div
      className="mx-2 h-6 w-px bg-border/60"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

export function Navbar() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId, project } = useProject();
  const { query, setQuery, active, clear, registerInputRef } = useSearch();
  const handleOpenInEditor = useOpenProjectInEditor(project || null);
  const { data: onlineCount } = useDiscordOnlineCount();
  const { loginStatus, reloadSystem } = useUserSystem();
  const {
    phase: gwPhase,
    selectedMachineId,
    machines,
    disconnectMachine,
  } = useGateway();
  const navigate = useNavigate();
  const isGatewayReady = gwPhase === 'ready';
  const selectedMachine = isGatewayReady
    ? machines.find((m) => m.machine_id === selectedMachineId)
    : null;
  const handleSwitchMachine = useCallback(() => {
    disconnectMachine();
    navigate('/');
  }, [disconnectMachine, navigate]);

  const { data: repos } = useProjectRepos(projectId);
  const isSingleRepoProject = repos?.length === 1;
  const { isDrawerOpen, toggleDrawer } = useTerminalDrawer();
  const { data: homeDirData } = useHomeDir();

  const handleToggleTerminal = useCallback(() => {
    if (projectId && repos?.length) {
      const repoPath = String(repos[0].path);
      toggleDrawer(repoPath, `project-terminal:${projectId}`);
    } else if (homeDirData?.home_dir) {
      toggleDrawer(homeDirData.home_dir, 'global-terminal');
    }
  }, [projectId, repos, homeDirData, toggleDrawer]);

  const setSearchBarRef = useCallback(
    (node: HTMLInputElement | null) => {
      registerInputRef(node);
    },
    [registerInputRef]
  );
  const { t } = useTranslation(['tasks', 'common']);
  // Navbar is global, but the share tasks toggle only makes sense on the tasks route
  const isTasksRoute = /^\/local-projects\/[^/]+\/tasks/.test(
    location.pathname
  );
  const showSharedTasks = searchParams.get('shared') !== 'off';
  const shouldShowSharedToggle =
    isTasksRoute && active && project?.remote_project_id != null;

  const handleSharedToggle = useCallback(
    (checked: boolean) => {
      const params = new URLSearchParams(searchParams);
      if (checked) {
        params.delete('shared');
      } else {
        params.set('shared', 'off');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleCreateTask = () => {
    if (projectId) {
      openTaskForm({ mode: 'create', projectId });
    }
  };

  const handleOpenInIDE = () => {
    handleOpenInEditor();
  };

  const handleOpenOAuth = async () => {
    const profile = await OAuthDialog.show();
    if (profile) {
      await reloadSystem();
    }
  };

  const handleOAuthLogout = async () => {
    try {
      await oauthApi.logout();
      await reloadSystem();
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const isOAuthLoggedIn = loginStatus?.status === 'loggedin';

  return (
    <div className="border-b bg-background">
      <div className="w-full px-3">
        <div className="flex items-center h-12 py-2">
          <div className="flex-1 flex items-center">
            <Link to="/local-projects">
              <Logo />
            </Link>
            <a
              href="https://discord.gg/AC4nwVtJM3"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Discord"
              className="hidden sm:inline-flex items-center ml-3 text-xs font-medium overflow-hidden border h-6"
            >
              <span className="bg-muted text-foreground flex items-center p-2 border-r">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={siDiscord.path} />
                </svg>
              </span>
              <span
                className=" h-full items-center flex p-2"
                aria-live="polite"
              >
                {onlineCount != null
                  ? `${onlineCount.toLocaleString()} online`
                  : 'online'}
              </span>
            </a>
            {selectedMachine && (
              <>
                <NavDivider />
                <div className="flex items-center gap-1.5 text-xs">
                  <Monitor className="h-3.5 w-3.5 opacity-60" />
                  <span className="font-medium">
                    {selectedMachine.hostname || selectedMachine.machine_id}
                    {selectedMachine.port > 0 && (
                      <span className="opacity-50">
                        :{selectedMachine.port}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleSwitchMachine}
                    aria-label="Switch machine"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <SearchBar
              ref={setSearchBarRef}
              className="shrink-0"
              value={query}
              onChange={setQuery}
              disabled={!active}
              onClear={clear}
              project={project || null}
            />
          </div>

          <div className="flex flex-1 items-center justify-end gap-1">
            {isOAuthLoggedIn && shouldShowSharedToggle ? (
              <>
                <div className="flex items-center gap-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Switch
                            checked={showSharedTasks}
                            onCheckedChange={handleSharedToggle}
                            aria-label={t('tasks:filters.sharedToggleAria')}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t('tasks:filters.sharedToggleTooltip')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <NavDivider />
              </>
            ) : null}

            {projectId ? (
              <>
                <div className="flex items-center gap-1">
                  {isSingleRepoProject && (
                    <OpenInIdeButton
                      onClick={handleOpenInIDE}
                      className="h-9 w-9"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={handleCreateTask}
                    aria-label="Create new task"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <NavDivider />
              </>
            ) : null}

            {/* <Button variant="ghost" size="sm" className="h-9 gap-1.5" asChild>
              <Link to="/workspaces">
                <Sparkles className="h-4 w-4" />
                {t('common:navbar.tryNewUI')}
              </Link>
            </Button>
            <NavDivider /> */}

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9', isDrawerOpen && 'bg-accent')}
                onClick={handleToggleTerminal}
                disabled={!homeDirData?.home_dir && !repos?.length}
                aria-label="Toggle terminal"
              >
                <SquareTerminal className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                asChild
                aria-label="Settings"
              >
                <Link
                  to={
                    projectId
                      ? `/settings/projects?projectId=${projectId}`
                      : '/settings'
                  }
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Main navigation"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {INTERNAL_NAV.map((item) => {
                    const active = location.pathname.startsWith(item.to);
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.to}
                        asChild
                        className={active ? 'bg-accent' : ''}
                      >
                        <Link to={item.to}>
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuSeparator />

                  {EXTERNAL_LINKS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </a>
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuSeparator />

                  {isOAuthLoggedIn ? (
                    <DropdownMenuItem onSelect={handleOAuthLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      {t('common:signOut')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={handleOpenOAuth}>
                      <LogIn className="mr-2 h-4 w-4" />
                      {t('common:signIn')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
