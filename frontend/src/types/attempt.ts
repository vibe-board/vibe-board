import type { Workspace, SessionWithCost } from 'shared/types';

/**
 * WorkspaceWithSession includes the latest Session for the workspace.
 * Provides access to session.id, session.executor, etc.
 */
export type WorkspaceWithSession = Workspace & {
  session: SessionWithCost | undefined;
};

/**
 * Create a WorkspaceWithSession from a Workspace and Session.
 */
export function createWorkspaceWithSession(
  workspace: Workspace,
  session: SessionWithCost | undefined
): WorkspaceWithSession {
  return {
    ...workspace,
    session,
  };
}
