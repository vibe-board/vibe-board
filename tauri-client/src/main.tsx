import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { hydrateProjectsFromCache } from '@/api/hooks/useProjects';
import { useConnectionStore } from '@/stores/useConnectionStore';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// Hydrate query cache from local SQLite before rendering (local mode only)
const { mode } = useConnectionStore.getState();
if (mode !== 'gateway') {
  hydrateProjectsFromCache(queryClient).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
