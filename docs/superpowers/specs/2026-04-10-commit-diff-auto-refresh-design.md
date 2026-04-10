# Commit & Diff Panel Auto-Refresh

## Problem

When new commits are produced (by coding agents or external tools), the Diff panel and Commits list do not update automatically. Users must manually refresh or navigate away and back to see changes.

## Root Cause

- `useCommitHistory` uses `useInfiniteQuery` with `staleTime: 30_000` but no `refetchInterval` — data is only refetched on window focus or component remount.
- `useDiffStream` uses `useQuery` with `staleTime: 0` but no `refetchInterval` — same passive refetch behavior.

Neither hook actively polls for changes.

## Solution

Add a 15-second `refetchInterval` to both hooks so they periodically check for new data while the panel is visible and the browser tab is active.

### Changes

**`frontend/src/hooks/useCommitHistory.ts`**
- Add `refetchInterval: 15_000` to the `useInfiniteQuery` options
- Add `refetchIntervalInBackground: false` to stop polling when the tab is hidden

**`frontend/src/hooks/useDiffStream.ts`**
- Add `refetchInterval: 15_000` to the `useQuery` options
- Add `refetchIntervalInBackground: false` to stop polling when the tab is hidden

### Design Decisions

- **15s interval**: Coding agents typically commit every 30s–several minutes. 15s gives responsive updates without excessive load.
- **No background polling**: Saves resources when the user isn't looking at the app.
- **Frontend-only**: No backend changes needed. Git commits aren't DB events, so the existing SQLite hook event system can't detect them. Polling is the simplest reliable approach that works regardless of commit source.
- **React Query window focus**: The default `refetchOnWindowFocus: true` behavior ensures an immediate refresh when switching back to the tab, complementing the interval.
