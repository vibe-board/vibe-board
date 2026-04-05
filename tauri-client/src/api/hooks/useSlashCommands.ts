import { useCallback, useMemo } from 'react';
import type { BaseCodingAgent, SlashCommandDescription } from '@shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { apiClient } from '../client';

type SlashCommandsStreamState = {
  commands: SlashCommandDescription[];
  discovering: boolean;
  error: string | null;
};

export function useSlashCommands(
  agent: BaseCodingAgent | null | undefined,
) {
  const endpoint = useMemo(() => {
    if (!agent) return undefined;
    return apiClient.wsUrl('/api/agents/slash-commands/ws', {
      executor: String(agent),
    });
  }, [agent]);

  const initialData = useCallback(
    (): SlashCommandsStreamState => ({
      commands: [],
      discovering: false,
      error: null,
    }),
    [],
  );

  const { data, error, isConnected, isInitialized } =
    useJsonPatchWsStream<SlashCommandsStreamState>(
      endpoint,
      !!endpoint,
      initialData,
    );

  const combinedError = data?.error ?? error;

  return {
    commands: data?.commands ?? [],
    discovering: data?.discovering ?? false,
    error: combinedError,
    isConnected,
    isInitialized,
  };
}
