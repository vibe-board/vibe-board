# Consumer File List — Multi-Tab Parallel Requests Migration

All 89 React files that import API namespace objects and need `useApi()` migration.

## Hooks (56 files)

| # | File | Namespaces Used |
|---|------|----------------|
| 1 | `hooks/auth/useAuthMutations.ts` | `oauthApi` |
| 2 | `hooks/auth/useAuthStatus.ts` | `oauthApi` |
| 3 | `hooks/useAgentAvailability.ts` | `configApi` |
| 4 | `hooks/useApprovalMutation.ts` | `approvalsApi` |
| 5 | `hooks/useAttempt.ts` | `attemptsApi` |
| 6 | `hooks/useAttemptBranch.ts` | `attemptsApi` |
| 7 | `hooks/useAttemptConflicts.ts` | `attemptsApi` |
| 8 | `hooks/useAttemptCreation.ts` | `attemptsApi` |
| 9 | `hooks/useAttemptExecution.ts` | `attemptsApi`, `executionProcessesApi` |
| 10 | `hooks/useAttemptRepo.ts` | `attemptsApi` |
| 11 | `hooks/useBranchStatus.ts` | `attemptsApi` |
| 12 | `hooks/useChangeTargetBranch.ts` | `attemptsApi` |
| 13 | `hooks/useCommitHistory.ts` | `attemptsApi` |
| 14 | `hooks/useCreateAttachments.ts` | `imagesApi` |
| 15 | `hooks/useCreateModeState.ts` | `projectsApi`, `repoApi` |
| 16 | `hooks/useCreateSession.ts` | `sessionsApi` |
| 17 | `hooks/useCreateWorkspace.ts` | `tasksApi`, `attemptsApi` |
| 18 | `hooks/useDevServer.ts` | `attemptsApi`, `executionProcessesApi` |
| 19 | `hooks/useDiffStream.ts` | `attemptsApi` |
| 20 | `hooks/useEditorAvailability.ts` | `configApi` |
| 21 | `hooks/useFollowUpSend.ts` | `sessionsApi` |
| 22 | `hooks/useForcePush.ts` | `attemptsApi` |
| 23 | `hooks/useHasDevServerScript.ts` | `projectsApi` |
| 24 | `hooks/useHomeDir.ts` | `systemApi` |
| 25 | `hooks/useImageUpload.ts` | `imagesApi` |
| 26 | `hooks/useMerge.ts` | `attemptsApi` |
| 27 | `hooks/useMessageEditRetry.ts` | `sessionsApi` |
| 28 | `hooks/useOpenInEditor.ts` | `attemptsApi` |
| 29 | `hooks/useOpenProjectInEditor.ts` | `projectsApi` |
| 30 | `hooks/usePrComments.ts` | `attemptsApi` |
| 31 | `hooks/useProfiles.ts` | `profilesApi` |
| 32 | `hooks/useProjectMutations.ts` | `projectsApi` |
| 33 | `hooks/useProjectRepos.ts` | `projectsApi` |
| 34 | `hooks/useProjectWorkspaceCreateDraft.ts` | `scratchApi` |
| 35 | `hooks/usePush.ts` | `attemptsApi` |
| 36 | `hooks/useRebase.ts` | `attemptsApi` |
| 37 | `hooks/useRenameBranch.ts` | `attemptsApi` |
| 38 | `hooks/useRepoBranchSelection.ts` | `repoApi` |
| 39 | `hooks/useRepoBranches.ts` | `repoApi` |
| 40 | `hooks/useRetryProcess.ts` | `sessionsApi` |
| 41 | `hooks/useScratch.ts` | `scratchApi` |
| 42 | `hooks/useSessionAttachments.ts` | `imagesApi` |
| 43 | `hooks/useSessionQueueInteraction.ts` | `queueApi` |
| 44 | `hooks/useSessionSend.ts` | `sessionsApi` |
| 45 | `hooks/useSlashCommands.ts` | `agentsApi` |
| 46 | `hooks/useTask.ts` | `tasksApi` |
| 47 | `hooks/useTaskAttempt.ts` | `attemptsApi` |
| 48 | `hooks/useTaskAttempts.ts` | `attemptsApi`, `sessionsApi` |
| 49 | `hooks/useTaskHistory.ts` | `tasksApi` |
| 50 | `hooks/useTaskImages.ts` | `imagesApi` |
| 51 | `hooks/useTaskMutations.ts` | `tasksApi` |
| 52 | `hooks/useTaskRelationships.ts` | `attemptsApi` |
| 53 | `hooks/useWorkspaceCount.ts` | `attemptsApi` |
| 54 | `hooks/useWorkspaceMutations.ts` | `attemptsApi` |
| 55 | `hooks/useWorkspaceSessions.ts` | `sessionsApi` |
| 56 | `hooks/useConversationHistory/useConversationHistoryOld.ts` | `executionProcessesApi` |

## Components (28 files)

| # | File | Namespaces Used |
|---|------|----------------|
| 57 | `components/ConfigProvider.tsx` | `configApi` |
| 58 | `components/DiffCard.tsx` | `attemptsApi` |
| 59 | `components/TagManager.tsx` | `tagsApi` |
| 60 | `components/layout/Navbar.tsx` | `oauthApi` |
| 61 | `components/projects/ProjectCard.tsx` | `projectsApi` |
| 62 | `components/projects/ProjectDetail.tsx` | `projectsApi` |
| 63 | `components/tasks/TaskCard.tsx` | `attemptsApi` |
| 64 | `components/tasks/TaskFollowUpSection.tsx` | `tasksApi`, `attemptsApi`, `imagesApi`, `queueApi` |
| 65 | `components/tasks/TaskDetails/ProcessesTab.tsx` | `executionProcessesApi` |
| 66 | `components/panels/DiffsPanel.tsx` | `attemptsApi` |
| 67 | `components/ui/actions-dropdown.tsx` | `profilesApi` |
| 68 | `components/ui/multi-file-search-textarea.tsx` | `projectsApi`, `repoApi` |
| 69 | `components/ui/wysiwyg/plugins/file-tag-typeahead-plugin.tsx` | `repoApi` |
| 70 | `components/NormalizedConversation/NextActionCard.tsx` | `attemptsApi`, `sessionsApi` |
| 71 | `components/NormalizedConversation/PendingApprovalEntry.tsx` | `approvalsApi` |
| 72 | `components/NormalizedConversation/RetryEditorInline.tsx` | `imagesApi` |
| 73 | `components/dialogs/settings/ImportConfigDialog.tsx` | `configTransferApi` |
| 74 | `components/dialogs/settings/ExportConfigDialog.tsx` | `configTransferApi` |
| 75 | `components/dialogs/shared/FolderPickerDialog.tsx` | `fileSystemApi` |
| 76 | `components/dialogs/shared/RepoPickerDialog.tsx` | `fileSystemApi`, `repoApi` |
| 77 | `components/dialogs/tasks/CreatePRDialog.tsx` | `attemptsApi` |
| 78 | `components/dialogs/tasks/DeleteTaskConfirmationDialog.tsx` | `tasksApi` |
| 79 | `components/dialogs/tasks/RestoreLogsDialog.tsx` | `executionProcessesApi` |
| 80 | `components/dialogs/tasks/RevertCommitDialog.tsx` | `attemptsApi` |
| 81 | `components/dialogs/tasks/StartReviewDialog.tsx` | `sessionsApi` |
| 82 | `components/dialogs/tasks/TagEditDialog.tsx` | `tagsApi` |
| 83 | `components/dialogs/CreateWorkspaceFromPrDialog.tsx` | `attemptsApi`, `repoApi` |
| 84 | `components/dialogs/auth/GhCliSetupDialog.tsx` | `attemptsApi` |
| 85 | `components/dialogs/scripts/ScriptFixerDialog.tsx` | `attemptsApi`, `repoApi` |

## Pages (5 files)

| # | File | Namespaces Used |
|---|------|----------------|
| 86 | `pages/ProjectTasks.tsx` | `tasksApi` |
| 87 | `pages/settings/AgentSettings.tsx` | `profilesApi` |
| 88 | `pages/settings/McpSettings.tsx` | `mcpServersApi` |
| 89 | `pages/settings/ProjectSettings.tsx` | `projectsApi` |
| 90 | `pages/settings/ReposSettings.tsx` | `repoApi` |

## Non-React Utility (1 file)

| # | File | Namespaces Used |
|---|------|----------------|
| 91 | `lib/searchTagsAndFiles.ts` | `projectsApi`, `searchApi`, `tagsApi` |

## Files that do NOT need migration (type/utility imports only)

- `hooks/useGitOperations.ts` — imports `Result` type only
- `hooks/useJsonPatchWsStream.ts` — imports `getWsBaseUrl` (migrated in Task 3)
- `hooks/useLogStream.ts` — imports `getWsBaseUrl` (migrated in Task 3)
- `utils/streamJsonPatchEntries.ts` — imports `getWsBaseUrl` (migrated in Task 3)
- `components/panels/XTermInstance.tsx` — imports `getWsBaseUrl` (migrated in Task 3)
