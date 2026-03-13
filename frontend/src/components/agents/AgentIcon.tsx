import { BaseCodingAgent, ThemeMode } from 'shared/types';
import { useTheme } from '@/components/ThemeProvider';

type AgentIconProps = {
  agent: BaseCodingAgent | null | undefined;
  className?: string;
};

function getResolvedTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

export function getAgentName(
  agent: BaseCodingAgent | null | undefined
): string {
  if (!agent) return 'Agent';
  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      return 'Claude Code';
    case BaseCodingAgent.AMP:
      return 'AMP';
    case BaseCodingAgent.AUGGIE:
      return 'Auggie';
    case BaseCodingAgent.AUTOHAND:
      return 'Autohand';
    case BaseCodingAgent.CLINE:
      return 'Cline';
    case BaseCodingAgent.CODEBUDDY_CODE:
      return 'Codebuddy Code';
    case BaseCodingAgent.CORUST_AGENT:
      return 'Corust Agent';
    case BaseCodingAgent.CROW_CLI:
      return 'Crow CLI';
    case BaseCodingAgent.DEEPAGENTS:
      return 'Deepagents';
    case BaseCodingAgent.DIMCODE:
      return 'Dimcode';
    case BaseCodingAgent.FAST_AGENT:
      return 'Fast Agent';
    case BaseCodingAgent.GEMINI:
      return 'Gemini';
    case BaseCodingAgent.GOOSE:
      return 'Goose';
    case BaseCodingAgent.JUNIE:
      return 'Junie';
    case BaseCodingAgent.KILO:
      return 'Kilo';
    case BaseCodingAgent.KIMI:
      return 'Kimi';
    case BaseCodingAgent.MINION_CODE:
      return 'Minion Code';
    case BaseCodingAgent.MISTRAL_VIBE:
      return 'Mistral Vibe';
    case BaseCodingAgent.NOVA:
      return 'Nova';
    case BaseCodingAgent.PI_ACP:
      return 'Pi ACP';
    case BaseCodingAgent.QODER:
      return 'Qoder';
    case BaseCodingAgent.STAKPAK:
      return 'Stakpak';
    case BaseCodingAgent.CODEX:
      return 'Codex';
    case BaseCodingAgent.OPENCODE:
      return 'OpenCode';
    case BaseCodingAgent.CURSOR_AGENT:
      return 'Cursor';
    case BaseCodingAgent.QWEN_CODE:
      return 'Qwen';
    case BaseCodingAgent.COPILOT:
      return 'Copilot';
    case BaseCodingAgent.DROID:
      return 'Droid';
  }
}

export function AgentIcon({ agent, className = 'h-4 w-4' }: AgentIconProps) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const isDark = resolvedTheme === 'dark';
  const suffix = isDark ? '-dark' : '-light';

  if (!agent) {
    return null;
  }

  const agentName = getAgentName(agent);
  let iconPath = '';

  switch (agent) {
    case BaseCodingAgent.CLAUDE_CODE:
      iconPath = `/agents/claude${suffix}.svg`;
      break;
    case BaseCodingAgent.AMP:
      iconPath = `/agents/amp${suffix}.svg`;
      break;
    case BaseCodingAgent.AUGGIE:
      iconPath = `/agents/auggie${suffix}.svg`;
      break;
    case BaseCodingAgent.AUTOHAND:
      iconPath = `/agents/autohand${suffix}.svg`;
      break;
    case BaseCodingAgent.CLINE:
      iconPath = `/agents/cline${suffix}.svg`;
      break;
    case BaseCodingAgent.CODEBUDDY_CODE:
      iconPath = `/agents/codebuddy${suffix}.svg`;
      break;
    case BaseCodingAgent.CORUST_AGENT:
      iconPath = `/agents/corust${suffix}.svg`;
      break;
    case BaseCodingAgent.CROW_CLI:
      iconPath = `/agents/crow${suffix}.svg`;
      break;
    case BaseCodingAgent.DEEPAGENTS:
      iconPath = `/agents/deepagents${suffix}.svg`;
      break;
    case BaseCodingAgent.DIMCODE:
      iconPath = `/agents/dimcode${suffix}.svg`;
      break;
      break;
    case BaseCodingAgent.FAST_AGENT:
      iconPath = `/agents/fast-agent${suffix}.svg`;
      break;
    case BaseCodingAgent.GEMINI:
      iconPath = `/agents/gemini${suffix}.svg`;
      break;
    case BaseCodingAgent.GOOSE:
      iconPath = `/agents/goose${suffix}.svg`;
      break;
    case BaseCodingAgent.JUNIE:
      iconPath = `/agents/junie${suffix}.svg`;
      break;
    case BaseCodingAgent.KILO:
      iconPath = `/agents/kilo${suffix}.svg`;
      break;
    case BaseCodingAgent.KIMI:
      iconPath = `/agents/kimi${suffix}.svg`;
      break;
    case BaseCodingAgent.MINION_CODE:
      iconPath = `/agents/minion${suffix}.svg`;
      break;
    case BaseCodingAgent.MISTRAL_VIBE:
      iconPath = `/agents/mistral${suffix}.svg`;
      break;
    case BaseCodingAgent.NOVA:
      iconPath = `/agents/nova${suffix}.svg`;
      break;
    case BaseCodingAgent.PI_ACP:
      iconPath = `/agents/pi${suffix}.svg`;
      break;
    case BaseCodingAgent.QODER:
      iconPath = `/agents/qoder${suffix}.svg`;
      break;
    case BaseCodingAgent.STAKPAK:
      iconPath = `/agents/stakpak${suffix}.svg`;
      break;
    case BaseCodingAgent.CODEX:
      iconPath = `/agents/codex${suffix}.svg`;
      break;
    case BaseCodingAgent.OPENCODE:
      iconPath = `/agents/opencode${suffix}.svg`;
      break;
    case BaseCodingAgent.CURSOR_AGENT:
      iconPath = `/agents/cursor${suffix}.svg`;
      break;
    case BaseCodingAgent.QWEN_CODE:
      iconPath = `/agents/qwen${suffix}.svg`;
      break;
    case BaseCodingAgent.COPILOT:
      iconPath = `/agents/copilot${suffix}.svg`;
      break;
    case BaseCodingAgent.DROID:
      iconPath = `/agents/droid${suffix}.svg`;
      break;
  }

  return <img src={iconPath} alt={agentName} className={className} />;
}
