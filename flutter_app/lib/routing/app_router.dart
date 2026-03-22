import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'routes.dart';
import '../ui/components/shell_route.dart';
import '../features/projects/project_list_screen.dart';
import '../features/tasks/task_list_screen.dart';
import '../features/tasks/task_detail_screen.dart';
import '../features/server_management/server_list_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/search/search_screen.dart';

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
  ],
);
