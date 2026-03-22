import '../models/tag.dart';
import 'api_client.dart';

class TagsApi {
  TagsApi(this._client);
  final ApiClient _client;

  Future<List<Tag>> getAll() async {
    final list = await _client.getList('/api/tags');
    return list.map((j) => Tag.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Tag> create(CreateTag body) async {
    final json = await _client.post('/api/tags', body: body.toJson());
    return Tag.fromJson(json);
  }

  Future<Tag> update(String tagId, CreateTag body) async {
    final json = await _client.put('/api/tags/$tagId', body: body.toJson());
    return Tag.fromJson(json);
  }

  Future<void> deleteTag(String tagId) async {
    await _client.delete('/api/tags/$tagId');
  }
}
