import type {
  ExecutorAction,
  ExecutorProfileId,
  ExecutionProcess,
} from '@shared/types';

export function extractProfileFromAction(
  action: ExecutorAction | null,
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

export function getLatestProfileFromProcesses(
  processes: ExecutionProcess[] | undefined,
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
