/// Route path constants.
class AppRoutes {
  AppRoutes._();

  static const String projects = '/projects';
  static const String projectDetail = '/projects/:projectId';
  static const String projectTasks = '/projects/:projectId/tasks';
  static const String taskDetail =
      '/projects/:projectId/tasks/:taskId';
  static const String sessionDetail =
      '/projects/:projectId/tasks/:taskId/attempts/:attemptId/sessions';
  static const String diffViewer =
      '/projects/:projectId/tasks/:taskId/attempts/:attemptId/diff';
  static const String images =
      '/projects/:projectId/tasks/:taskId/images';
  static const String terminal = '/terminal/:processId';
  static const String servers = '/servers';
  static const String settings = '/settings';
  static const String executorProfiles = '/settings/executor-profiles';
  static const String mcpServers = '/settings/mcp-servers';
  static const String notifications = '/settings/notifications';
  static const String search = '/search';
}
