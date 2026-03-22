import '../models/conversation.dart';
import 'api_client.dart';

class QueueApi {
  QueueApi(this._client);
  final ApiClient _client;

  Future<QueueStatus> getStatus(String sessionId) async {
    final json = await _client.get('/api/sessions/$sessionId/queue');
    return QueueStatus.fromJson(json);
  }

  Future<void> queueMessage(String sessionId, String message) async {
    await _client.post('/api/sessions/$sessionId/queue', body: {'message': message});
  }

  Future<void> cancel(String sessionId) async {
    await _client.delete('/api/sessions/$sessionId/queue');
  }
}
