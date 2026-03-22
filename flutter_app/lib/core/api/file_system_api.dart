import 'api_client.dart';

class FileSystemApi {
  FileSystemApi(this._client);
  final ApiClient _client;

  Future<List<Map<String, dynamic>>> list(String path) async {
    final list = await _client.getList(
      '/api/filesystem/list',
      query: {'path': path},
    );
    return list.map((j) => j as Map<String, dynamic>).toList();
  }

  Future<List<String>> listGitRepos(String path) async {
    final list = await _client.getList(
      '/api/filesystem/git-repos',
      query: {'path': path},
    );
    return list.map((j) => j as String).toList();
  }
}
