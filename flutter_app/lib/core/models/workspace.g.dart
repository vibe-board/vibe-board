// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$WorkspaceImpl _$$WorkspaceImplFromJson(Map<String, dynamic> json) =>
    _$WorkspaceImpl(
      id: json['id'] as String,
      taskId: json['task_id'] as String,
      containerRef: json['container_ref'] as String?,
      branch: json['branch'] as String,
      agentWorkingDir: json['agent_working_dir'] as String?,
      setupCompletedAt: json['setup_completed_at'] as String?,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
      archived: json['archived'] as bool,
      pinned: json['pinned'] as bool,
      name: json['name'] as String?,
      mode: $enumDecode(_$WorkspaceModeEnumMap, json['mode']),
    );

Map<String, dynamic> _$$WorkspaceImplToJson(_$WorkspaceImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'task_id': instance.taskId,
      'container_ref': instance.containerRef,
      'branch': instance.branch,
      'agent_working_dir': instance.agentWorkingDir,
      'setup_completed_at': instance.setupCompletedAt,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
      'archived': instance.archived,
      'pinned': instance.pinned,
      'name': instance.name,
      'mode': _$WorkspaceModeEnumMap[instance.mode]!,
    };

const _$WorkspaceModeEnumMap = {
  WorkspaceMode.worktree: 'worktree',
  WorkspaceMode.direct: 'direct',
};

_$WorkspaceWithStatusImpl _$$WorkspaceWithStatusImplFromJson(
  Map<String, dynamic> json,
) => _$WorkspaceWithStatusImpl(
  isRunning: json['is_running'] as bool,
  isErrored: json['is_errored'] as bool,
  id: json['id'] as String,
  taskId: json['task_id'] as String,
  containerRef: json['container_ref'] as String?,
  branch: json['branch'] as String,
  agentWorkingDir: json['agent_working_dir'] as String?,
  setupCompletedAt: json['setup_completed_at'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  archived: json['archived'] as bool,
  pinned: json['pinned'] as bool,
  name: json['name'] as String?,
  mode: $enumDecode(_$WorkspaceModeEnumMap, json['mode']),
);

Map<String, dynamic> _$$WorkspaceWithStatusImplToJson(
  _$WorkspaceWithStatusImpl instance,
) => <String, dynamic>{
  'is_running': instance.isRunning,
  'is_errored': instance.isErrored,
  'id': instance.id,
  'task_id': instance.taskId,
  'container_ref': instance.containerRef,
  'branch': instance.branch,
  'agent_working_dir': instance.agentWorkingDir,
  'setup_completed_at': instance.setupCompletedAt,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'archived': instance.archived,
  'pinned': instance.pinned,
  'name': instance.name,
  'mode': _$WorkspaceModeEnumMap[instance.mode]!,
};

_$WorkspaceSummaryImpl _$$WorkspaceSummaryImplFromJson(
  Map<String, dynamic> json,
) => _$WorkspaceSummaryImpl(
  workspaceId: json['workspace_id'] as String,
  latestSessionId: json['latest_session_id'] as String?,
  hasPendingApproval: json['has_pending_approval'] as bool,
  filesChanged: (json['files_changed'] as num?)?.toInt(),
  linesAdded: (json['lines_added'] as num?)?.toInt(),
  linesRemoved: (json['lines_removed'] as num?)?.toInt(),
  latestProcessCompletedAt: json['latest_process_completed_at'] as String?,
  latestProcessStatus: $enumDecodeNullable(
    _$ExecutionProcessStatusEnumMap,
    json['latest_process_status'],
  ),
  hasRunningDevServer: json['has_running_dev_server'] as bool,
  hasUnseenTurns: json['has_unseen_turns'] as bool,
  prStatus: $enumDecodeNullable(_$MergeStatusEnumMap, json['pr_status']),
);

Map<String, dynamic> _$$WorkspaceSummaryImplToJson(
  _$WorkspaceSummaryImpl instance,
) => <String, dynamic>{
  'workspace_id': instance.workspaceId,
  'latest_session_id': instance.latestSessionId,
  'has_pending_approval': instance.hasPendingApproval,
  'files_changed': instance.filesChanged,
  'lines_added': instance.linesAdded,
  'lines_removed': instance.linesRemoved,
  'latest_process_completed_at': instance.latestProcessCompletedAt,
  'latest_process_status':
      _$ExecutionProcessStatusEnumMap[instance.latestProcessStatus],
  'has_running_dev_server': instance.hasRunningDevServer,
  'has_unseen_turns': instance.hasUnseenTurns,
  'pr_status': _$MergeStatusEnumMap[instance.prStatus],
};

const _$ExecutionProcessStatusEnumMap = {
  ExecutionProcessStatus.running: 'running',
  ExecutionProcessStatus.completed: 'completed',
  ExecutionProcessStatus.failed: 'failed',
  ExecutionProcessStatus.killed: 'killed',
};

const _$MergeStatusEnumMap = {
  MergeStatus.open: 'open',
  MergeStatus.merged: 'merged',
  MergeStatus.closed: 'closed',
  MergeStatus.unknown: 'unknown',
};

_$UpdateWorkspaceImpl _$$UpdateWorkspaceImplFromJson(
  Map<String, dynamic> json,
) => _$UpdateWorkspaceImpl(
  archived: json['archived'] as bool?,
  pinned: json['pinned'] as bool?,
  name: json['name'] as String?,
);

Map<String, dynamic> _$$UpdateWorkspaceImplToJson(
  _$UpdateWorkspaceImpl instance,
) => <String, dynamic>{
  'archived': instance.archived,
  'pinned': instance.pinned,
  'name': instance.name,
};
