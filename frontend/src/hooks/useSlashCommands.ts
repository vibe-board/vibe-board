import { useCallback, useEffect, useMemo } from 'react';
import type { BaseCodingAgent, SlashCommandDescription } from 'shared/types';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import { useApi } from '@/hooks/useApi';

type SlashCommandsStreamState = {
  commands: SlashCommandDescription[];
  discovering: boolean;
  error: string | null;
};

export function useSlashCommands(
  agent: BaseCodingAgent | null | undefined,
  opts?: { workspaceId?: string; repoId?: string }
) {
  const { agentsApi } = useApi();
  const { workspaceId, repoId } = opts ?? {};
  const endpoint = useMemo(() => {
    if (!agent) return undefined;
    return agentsApi.getSlashCommandsStreamUrl(agent, { workspaceId, repoId });
  }, [agent, workspaceId, repoId]);

  const initialData = useCallback(
    (): SlashCommandsStreamState => ({
      commands: [],
      discovering: false,
      error: null,
    }),
    []
  );

  const { data, error, isConnected, isInitialized } =
    useJsonPatchWsStream<SlashCommandsStreamState>(
      endpoint,
      !!endpoint,
      initialData
    );

  const combinedError = data?.error ?? error;

  useEffect(() => {
    if (combinedError) {
      console.error('Failed to fetch slash commands', combinedError);
    }
  }, [combinedError]);

  return {
    commands: data?.commands ?? [],
    discovering: data?.discovering ?? false,
    error: combinedError,
    isConnected,
    isInitialized,
  };
}
