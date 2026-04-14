import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export function useHasDevServerScript(projectId?: string) {
  const { projectsApi } = useApi();
  return useQuery({
    queryKey: ['hasDevServerScript', projectId],
    queryFn: async () => {
      if (!projectId) return false;

      const repos = await projectsApi.getRepositories(projectId);
      return repos.some(
        (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
      );
    },
    enabled: !!projectId,
  });
}
