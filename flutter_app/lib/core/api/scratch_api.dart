import '../models/scratch.dart';
import 'api_client.dart';

class ScratchApi {
  ScratchApi(this._client);
  final ApiClient _client;

  Future<Scratch?> get(String scratchType, String id) async {
    try {
      final json = await _client.get('/api/scratch/$scratchType/$id');
      return Scratch.fromJson(json);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<Scratch> create(String scratchType, String id, String content) async {
    final json = await _client.post(
      '/api/scratch/$scratchType/$id',
      body: {'content': content},
    );
    return Scratch.fromJson(json);
  }

  Future<Scratch> update(String scratchType, String id, String content) async {
    final json = await _client.put(
      '/api/scratch/$scratchType/$id',
      body: {'content': content},
    );
    return Scratch.fromJson(json);
  }

  Future<void> deleteScratch(String scratchType, String id) async {
    await _client.delete('/api/scratch/$scratchType/$id');
  }
}
