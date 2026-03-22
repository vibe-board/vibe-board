import 'api_client.dart';
import 'projects_api.dart';
import 'tasks_api.dart';
import 'sessions_api.dart';
import 'attempts_api.dart';
import 'repo_api.dart';
import 'config_api.dart';
import 'search_api.dart';
import 'auth_api.dart';

export 'api_client.dart';
export 'projects_api.dart';
export 'tasks_api.dart';
export 'sessions_api.dart';
export 'attempts_api.dart';
export 'repo_api.dart';
export 'config_api.dart';
export 'search_api.dart';
export 'auth_api.dart';

/// Top-level API namespace that groups all sub-APIs.
///
/// One instance per server connection. Created via [VibeApi.forServer].
class VibeApi {
  VibeApi._(this._client)
      : projects = ProjectsApi(_client),
        tasks = TasksApi(_client),
        sessions = SessionsApi(_client),
        attempts = AttemptsApi(_client),
        repos = ReposApi(_client),
        config = ConfigApi(_client),
        search = SearchApi(_client),
        auth = AuthApi(_client);

  factory VibeApi.forServer(String baseUrl) {
    return VibeApi._(ApiClient(baseUrl: baseUrl));
  }

  final ApiClient _client;

  final ProjectsApi projects;
  final TasksApi tasks;
  final SessionsApi sessions;
  final AttemptsApi attempts;
  final ReposApi repos;
  final ConfigApi config;
  final SearchApi search;
  final AuthApi auth;

  void dispose() => _client.dispose();
}
