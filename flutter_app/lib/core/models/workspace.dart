import 'package:freezed_annotation/freezed_annotation.dart';
import 'enums.dart';

part 'workspace.freezed.dart';
part 'workspace.g.dart';

@freezed
sealed class Workspace with _$Workspace {
  const factory Workspace({
    required String id,
    @JsonKey(name: 'task_id') required String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    required String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    required String createdAt,
    required String updatedAt,
    required bool archived,
    required bool pinned,
    String? name,
    required WorkspaceMode mode,
  }) = _Workspace;

  factory Workspace.fromJson(Map<String, dynamic> json) =>
      _$WorkspaceFromJson(json);
}

@freezed
sealed class WorkspaceWithStatus with _$WorkspaceWithStatus {
  const factory WorkspaceWithStatus({
    @JsonKey(name: 'is_running') required bool isRunning,
    @JsonKey(name: 'is_errored') required bool isErrored,
    required String id,
    @JsonKey(name: 'task_id') required String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    required String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    required String createdAt,
    required String updatedAt,
    required bool archived,
    required bool pinned,
    String? name,
    required WorkspaceMode mode,
  }) = _WorkspaceWithStatus;

  factory WorkspaceWithStatus.fromJson(Map<String, dynamic> json) =>
      _$WorkspaceWithStatusFromJson(json);
}

@freezed
sealed class WorkspaceSummary with _$WorkspaceSummary {
  const factory WorkspaceSummary({
    @JsonKey(name: 'workspace_id') required String workspaceId,
    @JsonKey(name: 'latest_session_id') String? latestSessionId,
    @JsonKey(name: 'has_pending_approval') required bool hasPendingApproval,
    @JsonKey(name: 'files_changed') int? filesChanged,
    @JsonKey(name: 'lines_added') int? linesAdded,
    @JsonKey(name: 'lines_removed') int? linesRemoved,
    @JsonKey(name: 'latest_process_completed_at')
    String? latestProcessCompletedAt,
    @JsonKey(name: 'latest_process_status')
    ExecutionProcessStatus? latestProcessStatus,
    @JsonKey(name: 'has_running_dev_server') required bool hasRunningDevServer,
    @JsonKey(name: 'has_unseen_turns') required bool hasUnseenTurns,
    @JsonKey(name: 'pr_status') MergeStatus? prStatus,
  }) = _WorkspaceSummary;

  factory WorkspaceSummary.fromJson(Map<String, dynamic> json) =>
      _$WorkspaceSummaryFromJson(json);
}

@freezed
sealed class UpdateWorkspace with _$UpdateWorkspace {
  const factory UpdateWorkspace({
    bool? archived,
    bool? pinned,
    String? name,
  }) = _UpdateWorkspace;

  factory UpdateWorkspace.fromJson(Map<String, dynamic> json) =>
      _$UpdateWorkspaceFromJson(json);
}
