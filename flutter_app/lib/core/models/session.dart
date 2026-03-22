import 'package:freezed_annotation/freezed_annotation.dart';
import 'enums.dart';

part 'session.freezed.dart';
part 'session.g.dart';

@freezed
sealed class Session with _$Session {
  const factory Session({
    required String id,
    @JsonKey(name: 'workspace_id') required String workspaceId,
    String? executor,
    required String createdAt,
    required String updatedAt,
  }) = _Session;

  factory Session.fromJson(Map<String, dynamic> json) =>
      _$SessionFromJson(json);
}

@freezed
sealed class ExecutionProcess with _$ExecutionProcess {
  const factory ExecutionProcess({
    required String id,
    @JsonKey(name: 'session_id') required String sessionId,
    @JsonKey(name: 'run_reason') required ExecutionProcessRunReason runReason,
    @JsonKey(name: 'executor_action')
    required Map<String, dynamic> executorAction,
    required ExecutionProcessStatus status,
    @JsonKey(name: 'exit_code') BigInt? exitCode,
    required bool dropped,
    required String startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    required String createdAt,
    required String updatedAt,
  }) = _ExecutionProcess;

  factory ExecutionProcess.fromJson(Map<String, dynamic> json) =>
      _$ExecutionProcessFromJson(json);
}

@freezed
sealed class ExecutorProfileId with _$ExecutorProfileId {
  const factory ExecutorProfileId({
    required String executor,
    String? variant,
  }) = _ExecutorProfileId;

  factory ExecutorProfileId.fromJson(Map<String, dynamic> json) =>
      _$ExecutorProfileIdFromJson(json);
}
