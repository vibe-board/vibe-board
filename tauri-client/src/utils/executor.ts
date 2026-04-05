import type { BaseCodingAgent } from '@shared/types';

export const AGENT_LABELS: Record<string, string> = {
  CLAUDE_CODE: 'Claude Code',
  AMP: 'Amp',
  GEMINI: 'Gemini',
  CODEX: 'Codex',
  OPENCODE: 'OpenCode',
  CURSOR_AGENT: 'Cursor Agent',
  QWEN_CODE: 'Qwen Code',
  COPILOT: 'Copilot',
  DROID: 'Droid',
  CLINE: 'Cline',
  GOOSE: 'Goose',
};

/**
 * Filter agents to only include enabled ones.
 * If agentEnabled is null/undefined, all agents are considered enabled (backwards compat).
 */
export function filterEnabledAgents(
  agents: BaseCodingAgent[],
  agentEnabled: BaseCodingAgent[] | undefined | null
): BaseCodingAgent[] {
  if (!agentEnabled || agentEnabled.length === 0) {
    return agents;
  }
  return agents.filter((a) => agentEnabled.includes(a));
}
