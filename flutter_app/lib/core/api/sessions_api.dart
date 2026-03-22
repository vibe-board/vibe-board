import '../models/session.dart';
import '../models/conversation.dart';
import 'api_client.dart';

class SessionsApi {
  SessionsApi(this._client);
  final ApiClient _client;

  Future<List<Session>> getByWorkspace(String workspaceId) async {
    final list = await _client.getList(
      '/api/sessions',
      query: {'workspace_id': workspaceId},
    );
    return list
        .map((j) => Session.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Session> getById(String sessionId) async {
    final json = await _client.get('/api/sessions/$sessionId');
    return Session.fromJson(json);
  }

  Future<Session> create({
    required String workspaceId,
    String? executor,
  }) async {
    final body = <String, dynamic>{'workspace_id': workspaceId};
    if (executor != null) body['executor'] = executor;
    final json = await _client.post('/api/sessions', body: body);
    return Session.fromJson(json);
  }

  Future<Map<String, dynamic>> followUp(
    String sessionId,
    Map<String, dynamic> body,
  ) async {
    return _client.post('/api/sessions/$sessionId/follow-up', body: body);
  }

  Future<void> reset(String sessionId) async {
    await _client.post('/api/sessions/$sessionId/reset');
  }

  Future<void> startReview(String sessionId) async {
    await _client.post('/api/sessions/$sessionId/review');
  }

  // Execution processes
  Future<Map<String, dynamic>> getExecutionProcess(String processId) async {
    return _client.get('/api/execution-processes/$processId');
  }

  Future<void> stopExecutionProcess(String processId) async {
    await _client.post('/api/execution-processes/$processId/stop');
  }

  // Conversation
  Future<List<ConversationEntry>> getConversation(String sessionId) async {
    final list = await _client.getList('/api/sessions/$sessionId/conversation');
    return list
        .map((j) => ConversationEntry.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  // Execution processes list
  Future<List<ExecutionProcess>> getExecutionProcesses(String sessionId) async {
    final list = await _client.getList('/api/sessions/$sessionId/execution-processes');
    return list
        .map((j) => ExecutionProcess.fromJson(j as Map<String, dynamic>))
        .toList();
  }
}
