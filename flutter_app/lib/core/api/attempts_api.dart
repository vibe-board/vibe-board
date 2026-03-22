import '../models/workspace.dart';
import '../models/repo.dart';
import '../models/commit.dart';
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

  // Git operations
  Future<void> push(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/push');
  }

  Future<void> forcePush(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/push/force');
  }

  Future<void> rebase(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/rebase');
  }

  Future<void> continueRebase(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/rebase/continue');
  }

  Future<void> abortConflicts(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/conflicts/abort');
  }

  Future<Map<String, dynamic>> createPr(String attemptId, {String? title, String? body}) async {
    final payload = <String, dynamic>{};
    if (title != null) payload['title'] = title;
    if (body != null) payload['body'] = body;
    return _client.post('/api/task-attempts/$attemptId/pr', body: payload);
  }

  Future<List<Commit>> getCommits(String attemptId) async {
    final list = await _client.getList('/api/task-attempts/$attemptId/commits');
    return list.map((j) => Commit.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getCommitDiff(String attemptId, String sha) async {
    return _client.get('/api/task-attempts/$attemptId/commits/$sha/diff');
  }

  Future<void> revertCommit(String attemptId, String sha) async {
    await _client.post('/api/task-attempts/$attemptId/commits/$sha/revert');
  }

  Future<Map<String, dynamic>> getBranchStatus(String attemptId) async {
    return _client.get('/api/task-attempts/$attemptId/branch-status');
  }

  Future<Map<String, dynamic>> getPrComments(String attemptId) async {
    return _client.get('/api/task-attempts/$attemptId/pr/comments');
  }

  Future<void> attachPr(String attemptId, Map<String, dynamic> body) async {
    await _client.post('/api/task-attempts/$attemptId/pr/attach', body: body);
  }

  Future<void> changeTargetBranch(String attemptId, {required String targetBranch}) async {
    await _client.post(
      '/api/task-attempts/$attemptId/change-target-branch',
      body: {'target_branch': targetBranch},
    );
  }

  Future<void> renameBranch(String attemptId, {required String newName}) async {
    await _client.post(
      '/api/task-attempts/$attemptId/rename-branch',
      body: {'new_name': newName},
    );
  }

  Future<void> runAgentSetup(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/run-agent-setup');
  }

  Future<void> runSetupScript(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/run-setup-script');
  }

  Future<void> runCleanupScript(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/run-cleanup-script');
  }

  Future<void> runArchiveScript(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/run-archive-script');
  }

  Future<void> startDevServer(String attemptId) async {
    await _client.post('/api/task-attempts/$attemptId/start-dev-server');
  }

  Future<String> getFirstMessage(String attemptId) async {
    return _client.getString('/api/task-attempts/$attemptId/first-message');
  }

  Future<void> linkToIssue(String attemptId, String issueUrl) async {
    await _client.post(
      '/api/task-attempts/$attemptId/issue',
      body: {'issue_url': issueUrl},
    );
  }

  Future<void> unlinkFromIssue(String attemptId) async {
    await _client.delete('/api/task-attempts/$attemptId/issue');
  }
}
