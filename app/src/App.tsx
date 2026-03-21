import { Route } from '@solidjs/router';
import { createSignal, onMount } from 'solid-js';
import { AppShell } from './components/layout/app-shell';
import { ThemeProvider } from './stores/theme';
import { ConnectionProvider } from './stores/connections';
import HomePage from './pages/home';
import ProjectsPage from './pages/projects';
import ProjectBoardPage from './pages/project-board';
import TaskDetailPage from './pages/task-detail';
import SettingsPage from './pages/settings';
import ConnectPage from './pages/connect';

export default function App() {
  return (
    <ThemeProvider>
      <ConnectionProvider>
        <Route path="/" component={AppShell}>
          <Route path="/" component={HomePage} />
          <Route path="/connect" component={ConnectPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/projects/:id" component={ProjectBoardPage} />
          <Route path="/projects/:id/tasks/:taskId" component={TaskDetailPage} />
          <Route path="/settings" component={SettingsPage} />
        </Route>
      </ConnectionProvider>
    </ThemeProvider>
  );
}
