import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api.dart';

/// Server configuration stored on device.
class ServerConfig {
  const ServerConfig({
    required this.id,
    required this.name,
    required this.baseUrl,
    this.isGateway = false,
  });

  final String id;
  final String name;
  final String baseUrl;
  final bool isGateway;

  ServerConfig copyWith({
    String? name,
    String? baseUrl,
    bool? isGateway,
  }) =>
      ServerConfig(
        id: id,
        name: name ?? this.name,
        baseUrl: baseUrl ?? this.baseUrl,
        isGateway: isGateway ?? this.isGateway,
      );
}

/// Manages the list of configured servers.
class ServerListNotifier extends Notifier<List<ServerConfig>> {
  @override
  List<ServerConfig> build() {
    // Default: one local server
    return [
      const ServerConfig(
        id: 'local',
        name: 'Local',
        baseUrl: 'http://localhost:3000',
      ),
    ];
  }

  void add(ServerConfig server) => state = [...state, server];

  void remove(String id) =>
      state = state.where((s) => s.id != id).toList();

  void update(ServerConfig updated) => state = state
      .map((s) => s.id == updated.id ? updated : s)
      .toList();
}

final serverListProvider =
    NotifierProvider<ServerListNotifier, List<ServerConfig>>(
  ServerListNotifier.new,
);

/// Currently active server (selected by user).
final activeServerProvider =
    StateProvider<ServerConfig?>((ref) => null);

/// API client for the currently active server.
final apiProvider = Provider<VibeApi?>((ref) {
  final server = ref.watch(activeServerProvider);
  if (server == null) return null;
  return VibeApi.forServer(server.baseUrl);
});

/// Derived sub-API providers that depend on [apiProvider].
final projectsApiProvider = Provider<ProjectsApi?>((ref) {
  return ref.watch(apiProvider)?.projects;
});

final tasksApiProvider = Provider<TasksApi?>((ref) {
  return ref.watch(apiProvider)?.tasks;
});

final sessionsApiProvider = Provider<SessionsApi?>((ref) {
  return ref.watch(apiProvider)?.sessions;
});

final attemptsApiProvider = Provider<AttemptsApi?>((ref) {
  return ref.watch(apiProvider)?.attempts;
});

final reposApiProvider = Provider<ReposApi?>((ref) {
  return ref.watch(apiProvider)?.repos;
});

final configApiProvider = Provider<ConfigApi?>((ref) {
  return ref.watch(apiProvider)?.config;
});

final searchApiProvider = Provider<SearchApi?>((ref) {
  return ref.watch(apiProvider)?.search;
});

final authApiProvider = Provider<AuthApi?>((ref) {
  return ref.watch(apiProvider)?.auth;
});
