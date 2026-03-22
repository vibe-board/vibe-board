import '../models/project.dart';
import '../models/repo.dart';
import 'api_client.dart';

class ProjectsApi {
  ProjectsApi(this._client);
  final ApiClient _client;

  Future<List<Project>> getAll() async {
    final list = await _client.getList('/api/projects');
    return list
        .map((j) => Project.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Project> create(CreateProject body) async {
    final json = await _client.post('/api/projects', body: body.toJson());
    return Project.fromJson(json);
  }

  Future<Project> update(String id, UpdateProject body) async {
    final json = await _client.put('/api/projects/$id', body: body.toJson());
    return Project.fromJson(json);
  }

  Future<void> deleteProject(String id) async {
    await _client.delete('/api/projects/$id');
  }

  Future<List<Repo>> getRepositories(String projectId) async {
    final list =
        await _client.getList('/api/projects/$projectId/repositories');
    return list.map((j) => Repo.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Repo> addRepository(String projectId, CreateProjectRepo body) async {
    final json = await _client.post(
      '/api/projects/$projectId/repositories',
      body: body.toJson(),
    );
    return Repo.fromJson(json);
  }

  Future<void> deleteRepository(String projectId, String repoId) async {
    await _client.delete('/api/projects/$projectId/repositories/$repoId');
  }
}
