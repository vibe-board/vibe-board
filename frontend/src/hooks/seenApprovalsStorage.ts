export const SEEN_APPROVALS_KEY = 'vk:seen_approvals';

export type SeenApprovals = Record<string, number>;

export function loadSeenApprovals(): SeenApprovals {
  try {
    const raw = localStorage.getItem(SEEN_APPROVALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SeenApprovals;
    }
    return {};
  } catch {
    return {};
  }
}

function save(value: SeenApprovals): void {
  try {
    localStorage.setItem(SEEN_APPROVALS_KEY, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — degrade silently. The badge will
    // re-render as unseen on next load, which is safe.
  }
}

export function markApprovalsSeen(approvalIds: string[], now: number): void {
  if (approvalIds.length === 0) return;
  const current = loadSeenApprovals();
  let changed = false;
  for (const id of approvalIds) {
    if (current[id] !== now) {
      current[id] = now;
      changed = true;
    }
  }
  if (changed) save(current);
}

export function pruneSeenApprovals(liveIds: Set<string>): void {
  const current = loadSeenApprovals();
  let changed = false;
  for (const id of Object.keys(current)) {
    if (!liveIds.has(id)) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) save(current);
}
