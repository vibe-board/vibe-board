import '../models/workspace.dart';
import '../models/repo.dart';
import 'api_client.dart';

class AttemptsApi {
  AttemptsApi(this._client);
  final ApiClient _client;

  Future<List<Workspace>> getAll({String? taskId}) async {
    final query = <String, String>{};
    if (taskId != null) query['task_id'] = taskId;
    final list = await _client.getList('/api/task-attempts', query: query);
    return list
        .map((j) => Workspace.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Workspace> get(String attemptId) async {
    final json = await _client.get('/api/task-attempts/$attemptId');
    return Workspace.fromJson(json);
  }

  Future<Workspace> create(Map<String, dynamic> body) async {
    final json = await _client.post('/api/task-attempts', body: body);
    return Workspace.fromJson(json);
  }

  Future<Workspace> update(String attemptId, UpdateWorkspace body) async {
    final json = await _client.put(
      '/api/task-attempts/$attemptId',
      body: body.toJson(),
    );
    return Workspace.fromJson(json);
  }

  Future<void> stop(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/stop');
  }

  Future<void> deleteAttempt(String attemptId, {bool deleteBranches = false}) async {
    await _client.delete(
      '/api/task-attempts/$attemptId',
      query: {'delete_branches': deleteBranches.toString()},
    );
  }

  Future<List<RepoWithTargetBranch>> getRepos(String attemptId) async {
    final list =
        await _client.getList('/api/task-attempts/$attemptId/repos');
    return list
        .map((j) => RepoWithTargetBranch.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> merge(String attemptId, Map<String, dynamic> body) async {
    await _client.post('/api/task-attempts/$attemptId/merge', body: body);
  }

  Future<void> markSeen(String attemptId) async {
    await _client.put('/api/task-attempts/$attemptId/mark-seen');
  }
}
