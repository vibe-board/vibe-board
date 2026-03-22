/// Route path constants.
class AppRoutes {
  AppRoutes._();

  static const String projects = '/projects';
  static const String projectDetail = '/projects/:projectId';
  static const String projectTasks = '/projects/:projectId/tasks';
  static const String taskDetail =
      '/projects/:projectId/tasks/:taskId';
  static const String servers = '/servers';
  static const String settings = '/settings';
  static const String search = '/search';
}
