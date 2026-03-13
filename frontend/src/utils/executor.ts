import type {
  BaseCodingAgent,
  ExecutorConfigs,
  ExecutorAction,
  ExecutorProfileId,
  ExecutionProcess,
} from 'shared/types';

/**
 * Compare two ExecutorProfileIds for equality.
 * Treats null/undefined variant as equivalent to "DEFAULT".
 */
export function areProfilesEqual(
  a: ExecutorProfileId | null | undefined,
  b: ExecutorProfileId | null | undefined
): boolean {
  if (!a || !b) return a === b;
  if (a.executor !== b.executor) return false;
  // Normalize variants: null/undefined -> 'DEFAULT'
  const variantA = a.variant ?? 'DEFAULT';
  const variantB = b.variant ?? 'DEFAULT';
  return variantA === variantB;
}

/**
 * Get variant options for a given executor from profiles.
 * Returns variants sorted: DEFAULT first, then alphabetically.
 */
export function getVariantOptions(
  executor: BaseCodingAgent | null | undefined,
  profiles: ExecutorConfigs['executors'] | null | undefined
): string[] {
  if (!executor || !profiles) return [];
  const executorConfig = profiles[executor];
  if (!executorConfig) return [];

  const variants = Object.keys(executorConfig);
  return variants.sort((a, b) => {
    if (a === 'DEFAULT') return -1;
    if (b === 'DEFAULT') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Sort agents by user-defined order, falling back to alphabetical.
 * Agents in agentOrder come first (in that order), then remaining agents alphabetically.
 */
export function getSortedAgents(
  agents: BaseCodingAgent[],
  agentOrder: BaseCodingAgent[] | undefined | null
): BaseCodingAgent[] {
  if (!agentOrder || agentOrder.length === 0) {
    return [...agents].sort();
  }
  const orderMap = new Map(agentOrder.map((a, i) => [a, i]));
  return [...agents].sort((a, b) => {
    const ai = orderMap.get(a);
    const bi = orderMap.get(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

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

/**
 * Extract ExecutorProfileId from an ExecutorAction chain.
 * Traverses the action chain to find the first coding agent request.
 */
export function extractProfileFromAction(
  action: ExecutorAction | null
): ExecutorProfileId | null {
  let curr: ExecutorAction | null = action;
  while (curr) {
    const typ = curr.typ;
    switch (typ.type) {
      case 'CodingAgentInitialRequest':
      case 'CodingAgentFollowUpRequest':
      case 'ReviewRequest':
        return typ.executor_profile_id;
      case 'ScriptRequest':
      default:
        curr = curr.next_action;
        continue;
    }
  }
  return null;
}

/**
 * Get the latest ExecutorProfileId from a list of execution processes.
 * Searches from most recent to oldest.
 */
export function getLatestProfileFromProcesses(
  processes: ExecutionProcess[] | undefined
): ExecutorProfileId | null {
  if (!processes?.length) return null;
  return (
    processes
      .slice()
      .reverse()
      .map((p) => extractProfileFromAction(p.executor_action ?? null))
      .find((pid) => pid !== null) ?? null
  );
}
