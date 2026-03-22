import '../models/session.dart';
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
}
