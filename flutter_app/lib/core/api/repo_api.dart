import '../models/repo.dart';
import 'api_client.dart';

class ReposApi {
  ReposApi(this._client);
  final ApiClient _client;

  Future<List<Repo>> list() async {
    final list = await _client.getList('/api/repos');
    return list.map((j) => Repo.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Repo> getById(String repoId) async {
    final json = await _client.get('/api/repos/$repoId');
    return Repo.fromJson(json);
  }

  Future<Repo> update(String repoId, UpdateRepo body) async {
    final json = await _client.put('/api/repos/$repoId', body: body.toJson());
    return Repo.fromJson(json);
  }

  Future<Repo> register({required String path, String? displayName}) async {
    final body = <String, dynamic>{'path': path};
    if (displayName != null) body['display_name'] = displayName;
    final json = await _client.post('/api/repos', body: body);
    return Repo.fromJson(json);
  }

  Future<List<String>> getBranches(String repoId) async {
    final list = await _client.getList('/api/repos/$repoId/branches');
    return list.map((j) => (j as Map<String, dynamic>)['name'] as String).toList();
  }

  Future<List<Repo>> getBatch(List<String> ids) async {
    final list = await _client.post('/api/repos/batch', body: {'ids': ids});
    return (list as List)
        .map((j) => Repo.fromJson(j as Map<String, dynamic>))
        .toList();
  }
}
