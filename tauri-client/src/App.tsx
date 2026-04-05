import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { ConnectScreen } from '@/components/connection/ConnectScreen';
import { GatewayProvider } from '@/contexts/GatewayContext';
import { GatewayGate } from '@/components/gateway/GatewayGate';
import PageShell from '@/components/layout/PageShell';
import ProjectsPage from '@/pages/ProjectsPage';
import TasksPage from '@/pages/TasksPage';
import TaskDetail from '@/components/tasks/TaskDetail';
import AttemptView from '@/components/tasks/AttemptView';
import DiffPage from '@/pages/DiffPage';
import CommitHistoryPage from '@/pages/CommitHistoryPage';
import GitActionsPage from '@/pages/GitActionsPage';
import TerminalPage from '@/pages/TerminalPage';
import DevServerPreview from '@/components/preview/DevServerPreview';
import SearchPage from '@/pages/SearchPage';
import SettingsPage from '@/pages/SettingsPage';
import GeneralSettings from '@/components/settings/GeneralSettings';
import ProjectSettings from '@/components/settings/ProjectSettings';
import AgentSettings from '@/components/settings/AgentSettings';
import MCPSettings from '@/components/settings/MCPSettings';
import E2EESettings from '@/components/settings/E2EESettings';
import ReposSettings from '@/components/settings/ReposSettings';
import AboutSettings from '@/components/settings/AboutSettings';

function AppRoutes() {
  const isConnected = useConnectionStore((s) => s.isConnected);
  const mode = useConnectionStore((s) => s.mode);
  const serverUrl = useConnectionStore((s) => s.serverUrl);

  // In gateway mode with a persisted server URL, skip ConnectScreen —
  // GatewayProvider will detect the gateway and handle login / auto-reconnect.
  const showConnectScreen = !isConnected && !(mode === 'gateway' && serverUrl);
  if (showConnectScreen) {
    return <ConnectScreen />;
  }

  const routes = (
    <Routes>
      {/* Full-screen routes (no tab bar, no nav) */}
      <Route path="/process/:processId/terminal" element={<TerminalPage />} />
      <Route path="/tasks/:taskId/preview" element={<DevServerPreview />} />

      <Route element={<PageShell />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
        <Route path="/tasks/:taskId/attempts/:attemptId" element={<AttemptView />} />
        <Route path="/tasks/:taskId/attempts/:attemptId/diff" element={<DiffPage />} />
        <Route path="/tasks/:taskId/attempts/:attemptId/commits" element={<CommitHistoryPage />} />
        <Route path="/tasks/:taskId/attempts/:attemptId/git-actions" element={<GitActionsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/general" element={<GeneralSettings />} />
        <Route path="/settings/projects" element={<ProjectSettings />} />
        <Route path="/settings/agents" element={<AgentSettings />} />
        <Route path="/settings/repos" element={<ReposSettings />} />
        <Route path="/settings/mcp" element={<MCPSettings />} />
        <Route path="/settings/e2ee" element={<E2EESettings />} />
        <Route path="/settings/about" element={<AboutSettings />} />
      </Route>
    </Routes>
  );

  // In gateway mode, wrap with GatewayProvider for E2EE lifecycle
  if (mode === 'gateway') {
    return (
      <GatewayProvider>
        <GatewayGate>{routes}</GatewayGate>
      </GatewayProvider>
    );
  }

  return routes;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
