// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SessionImpl _$$SessionImplFromJson(Map<String, dynamic> json) =>
    _$SessionImpl(
      id: json['id'] as String,
      workspaceId: json['workspace_id'] as String,
      executor: json['executor'] as String?,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$$SessionImplToJson(_$SessionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'workspace_id': instance.workspaceId,
      'executor': instance.executor,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };

_$ExecutionProcessImpl _$$ExecutionProcessImplFromJson(
  Map<String, dynamic> json,
) => _$ExecutionProcessImpl(
  id: json['id'] as String,
  sessionId: json['session_id'] as String,
  runReason: $enumDecode(
    _$ExecutionProcessRunReasonEnumMap,
    json['run_reason'],
  ),
  executorAction: json['executor_action'] as Map<String, dynamic>,
  status: $enumDecode(_$ExecutionProcessStatusEnumMap, json['status']),
  exitCode:
      json['exit_code'] == null
          ? null
          : BigInt.parse(json['exit_code'] as String),
  dropped: json['dropped'] as bool,
  startedAt: json['startedAt'] as String,
  completedAt: json['completed_at'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$$ExecutionProcessImplToJson(
  _$ExecutionProcessImpl instance,
) => <String, dynamic>{
  'id': instance.id,
  'session_id': instance.sessionId,
  'run_reason': _$ExecutionProcessRunReasonEnumMap[instance.runReason]!,
  'executor_action': instance.executorAction,
  'status': _$ExecutionProcessStatusEnumMap[instance.status]!,
  'exit_code': instance.exitCode?.toString(),
  'dropped': instance.dropped,
  'startedAt': instance.startedAt,
  'completed_at': instance.completedAt,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

const _$ExecutionProcessRunReasonEnumMap = {
  ExecutionProcessRunReason.setupscript: 'setupscript',
  ExecutionProcessRunReason.cleanupscript: 'cleanupscript',
  ExecutionProcessRunReason.archivescript: 'archivescript',
  ExecutionProcessRunReason.codingagent: 'codingagent',
  ExecutionProcessRunReason.commitmessage: 'commitmessage',
  ExecutionProcessRunReason.devserver: 'devserver',
};

const _$ExecutionProcessStatusEnumMap = {
  ExecutionProcessStatus.running: 'running',
  ExecutionProcessStatus.completed: 'completed',
  ExecutionProcessStatus.failed: 'failed',
  ExecutionProcessStatus.killed: 'killed',
};

_$ExecutorProfileIdImpl _$$ExecutorProfileIdImplFromJson(
  Map<String, dynamic> json,
) => _$ExecutorProfileIdImpl(
  executor: json['executor'] as String,
  variant: json['variant'] as String?,
);

Map<String, dynamic> _$$ExecutorProfileIdImplToJson(
  _$ExecutorProfileIdImpl instance,
) => <String, dynamic>{
  'executor': instance.executor,
  'variant': instance.variant,
};
