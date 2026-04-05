import { useMemo } from 'react';
import type { Project } from '@shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';

interface ProjectStreamState {
  projects: Record<string, Project>;
}

export function useProjectStream() {
  const { data, isInitialized, isConnected, error } =
    useJsonPatchWsStream<ProjectStreamState>(
      '/projects/stream/ws',
      true,
      () => ({ projects: {} }),
    );

  const projects = useMemo(
    () => data?.projects,
    [data],
  );

  return { projects, isInitialized, isConnected, error };
}
