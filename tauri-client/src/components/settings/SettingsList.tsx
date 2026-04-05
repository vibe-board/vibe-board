import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  FolderKanban,
  Bot,
  FolderGit2,
  Server,
  ShieldCheck,
  Info,
  ChevronRight,
} from 'lucide-react';

interface SettingsRow {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  descKey: string;
  path: string;
}

const ROWS: SettingsRow[] = [
  {
    key: 'general',
    icon: Settings,
    labelKey: 'settings.general',
    descKey: 'settings.generalDesc',
    path: '/settings/general',
  },
  {
    key: 'projects',
    icon: FolderKanban,
    labelKey: 'settings.projects',
    descKey: 'settings.projectsDesc',
    path: '/settings/projects',
  },
  {
    key: 'agents',
    icon: Bot,
    labelKey: 'settings.agents',
    descKey: 'settings.agentsDesc',
    path: '/settings/agents',
  },
  {
    key: 'repos',
    icon: FolderGit2,
    labelKey: 'settings.repos',
    descKey: 'settings.reposDesc',
    path: '/settings/repos',
  },
  {
    key: 'mcp',
    icon: Server,
    labelKey: 'settings.mcp',
    descKey: 'settings.mcpDesc',
    path: '/settings/mcp',
  },
  {
    key: 'e2ee',
    icon: ShieldCheck,
    labelKey: 'settings.e2ee',
    descKey: 'settings.e2eeDesc',
    path: '/settings/e2ee',
  },
  {
    key: 'about',
    icon: Info,
    labelKey: 'settings.about',
    descKey: 'settings.aboutDesc',
    path: '/settings/about',
  },
];

export default function SettingsList() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      {ROWS.map((row) => {
        const Icon = row.icon;
        return (
          <button
            key={row.key}
            onClick={() => navigate(row.path)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-accent active:bg-accent/80"
          >
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {t(row.labelKey)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(row.descKey)}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
