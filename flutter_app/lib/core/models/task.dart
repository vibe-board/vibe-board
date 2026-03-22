import 'package:freezed_annotation/freezed_annotation.dart';
import 'enums.dart';

part 'task.freezed.dart';
part 'task.g.dart';

@freezed
sealed class Task with _$Task {
  const factory Task({
    required String id,
    @JsonKey(name: 'project_id') required String projectId,
    required String title,
    String? description,
    required TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    required String createdAt,
    required String updatedAt,
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}

@freezed
sealed class TaskWithAttemptStatus with _$TaskWithAttemptStatus {
  const factory TaskWithAttemptStatus({
    @JsonKey(name: 'has_in_progress_attempt')
    required bool hasInProgressAttempt,
    @JsonKey(name: 'last_attempt_failed') required bool lastAttemptFailed,
    required String executor,
    String? variant,
    required String id,
    @JsonKey(name: 'project_id') required String projectId,
    required String title,
    String? description,
    required TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    required String createdAt,
    required String updatedAt,
  }) = _TaskWithAttemptStatus;

  factory TaskWithAttemptStatus.fromJson(Map<String, dynamic> json) =>
      _$TaskWithAttemptStatusFromJson(json);
}

@freezed
sealed class CreateTask with _$CreateTask {
  const factory CreateTask({
    @JsonKey(name: 'project_id') required String projectId,
    required String title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  }) = _CreateTask;

  factory CreateTask.fromJson(Map<String, dynamic> json) =>
      _$CreateTaskFromJson(json);
}

@freezed
sealed class UpdateTask with _$UpdateTask {
  const factory UpdateTask({
    String? title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  }) = _UpdateTask;

  factory UpdateTask.fromJson(Map<String, dynamic> json) =>
      _$UpdateTaskFromJson(json);
}
