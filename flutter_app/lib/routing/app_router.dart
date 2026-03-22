import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'routes.dart';
import '../ui/components/shell_route.dart';
import '../features/projects/project_list_screen.dart';
import '../features/tasks/task_list_screen.dart';
import '../features/tasks/task_detail_screen.dart';
import '../features/server_management/server_list_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/executor_profiles_screen.dart';
import '../features/settings/mcp_servers_screen.dart';
import '../features/settings/notifications_screen.dart';
import '../features/search/search_screen.dart';
import '../features/sessions/session_detail_screen.dart';
import '../features/diffs/diff_viewer_screen.dart';
import '../features/images/image_viewer_screen.dart';
import '../features/terminal/terminal_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: AppRoutes.projects,
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) {
        return AppShell(navigationShell: navigationShell);
      },
      branches: [
        // Projects branch
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: AppRoutes.projects,
              builder: (context, state) => const ProjectListScreen(),
              routes: [
                GoRoute(
                  path: 'tasks',
                  builder: (context, state) {
                    final projectId =
                        state.pathParameters['projectId']!;
                    return TaskListScreen(projectId: projectId);
                  },
                  routes: [
                    GoRoute(
                      path: ':taskId',
                      builder: (context, state) {
                        final projectId =
                            state.pathParameters['projectId']!;
                        final taskId =
                            state.pathParameters['taskId']!;
                        return TaskDetailScreen(
                          projectId: projectId,
                          taskId: taskId,
                        );
                      },
                      routes: [
                        GoRoute(
                          path: 'attempts/:attemptId/sessions',
                          builder: (context, state) {
                            final projectId =
                                state.pathParameters['projectId']!;
                            final taskId =
                                state.pathParameters['taskId']!;
                            final attemptId =
                                state.pathParameters['attemptId']!;
                            return SessionDetailScreen(
                              projectId: projectId,
                              taskId: taskId,
                              attemptId: attemptId,
                            );
                          },
                        ),
                        GoRoute(
                          path: 'attempts/:attemptId/diff',
                          builder: (context, state) {
                            final projectId =
                                state.pathParameters['projectId']!;
                            final taskId =
                                state.pathParameters['taskId']!;
                            final attemptId =
                                state.pathParameters['attemptId']!;
                            return DiffViewerScreen(
                              projectId: projectId,
                              taskId: taskId,
                              attemptId: attemptId,
                            );
                          },
                        ),
                        GoRoute(
                          path: 'images',
                          builder: (context, state) {
                            final projectId =
                                state.pathParameters['projectId']!;
                            final taskId =
                                state.pathParameters['taskId']!;
                            return ImageViewerScreen(
                              projectId: projectId,
                              taskId: taskId,
                            );
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        // Servers branch
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: AppRoutes.servers,
              builder: (context, state) =>
                  const ServerListScreen(),
            ),
          ],
        ),
        // Settings branch
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: AppRoutes.settings,
              builder: (context, state) =>
                  const SettingsScreen(),
              routes: [
                GoRoute(
                  path: 'executor-profiles',
                  builder: (context, state) =>
                      const ExecutorProfilesScreen(),
                ),
                GoRoute(
                  path: 'mcp-servers',
                  builder: (context, state) =>
                      const McpServersScreen(),
                ),
                GoRoute(
                  path: 'notifications',
                  builder: (context, state) =>
                      const NotificationsScreen(),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
    // Full-screen routes (not in shell)
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: AppRoutes.search,
      builder: (context, state) => const SearchScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/terminal/:processId',
      builder: (context, state) {
        final processId = state.pathParameters['processId']!;
        final name = state.uri.queryParameters['name'];
        return TerminalScreen(
          processId: processId,
          processName: name,
        );
      },
    ),
  ],
);
