import '../models/task.dart';
import 'api_client.dart';

class TasksApi {
  TasksApi(this._client);
  final ApiClient _client;

  Future<List<TaskWithAttemptStatus>> getAll(String projectId) async {
    final list = await _client.getList(
      '/api/tasks',
      query: {'project_id': projectId},
    );
    return list
        .map((j) =>
            TaskWithAttemptStatus.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Task> getById(String taskId) async {
    final json = await _client.get('/api/tasks/$taskId');
    return Task.fromJson(json);
  }

  Future<Task> create(CreateTask body) async {
    final json = await _client.post('/api/tasks', body: body.toJson());
    return Task.fromJson(json);
  }

  Future<Task> update(String taskId, UpdateTask body) async {
    final json = await _client.put('/api/tasks/$taskId', body: body.toJson());
    return Task.fromJson(json);
  }

  Future<void> deleteTask(String taskId) async {
    await _client.delete('/api/tasks/$taskId');
  }

  Future<Map<String, dynamic>> createAndStart(CreateTask body) async {
    return _client.post('/api/tasks/create-and-start', body: body.toJson());
  }
}
