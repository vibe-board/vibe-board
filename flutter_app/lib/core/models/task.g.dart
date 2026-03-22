// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$TaskImpl _$$TaskImplFromJson(Map<String, dynamic> json) => _$TaskImpl(
  id: json['id'] as String,
  projectId: json['project_id'] as String,
  title: json['title'] as String,
  description: json['description'] as String?,
  status: $enumDecode(_$TaskStatusEnumMap, json['status']),
  parentWorkspaceId: json['parent_workspace_id'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$$TaskImplToJson(_$TaskImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'project_id': instance.projectId,
      'title': instance.title,
      'description': instance.description,
      'status': _$TaskStatusEnumMap[instance.status]!,
      'parent_workspace_id': instance.parentWorkspaceId,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };

const _$TaskStatusEnumMap = {
  TaskStatus.todo: 'todo',
  TaskStatus.inprogress: 'inprogress',
  TaskStatus.inreview: 'inreview',
  TaskStatus.done: 'done',
  TaskStatus.cancelled: 'cancelled',
};

_$TaskWithAttemptStatusImpl _$$TaskWithAttemptStatusImplFromJson(
  Map<String, dynamic> json,
) => _$TaskWithAttemptStatusImpl(
  hasInProgressAttempt: json['has_in_progress_attempt'] as bool,
  lastAttemptFailed: json['last_attempt_failed'] as bool,
  executor: json['executor'] as String,
  variant: json['variant'] as String?,
  id: json['id'] as String,
  projectId: json['project_id'] as String,
  title: json['title'] as String,
  description: json['description'] as String?,
  status: $enumDecode(_$TaskStatusEnumMap, json['status']),
  parentWorkspaceId: json['parent_workspace_id'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$$TaskWithAttemptStatusImplToJson(
  _$TaskWithAttemptStatusImpl instance,
) => <String, dynamic>{
  'has_in_progress_attempt': instance.hasInProgressAttempt,
  'last_attempt_failed': instance.lastAttemptFailed,
  'executor': instance.executor,
  'variant': instance.variant,
  'id': instance.id,
  'project_id': instance.projectId,
  'title': instance.title,
  'description': instance.description,
  'status': _$TaskStatusEnumMap[instance.status]!,
  'parent_workspace_id': instance.parentWorkspaceId,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

_$CreateTaskImpl _$$CreateTaskImplFromJson(Map<String, dynamic> json) =>
    _$CreateTaskImpl(
      projectId: json['project_id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      status: $enumDecodeNullable(_$TaskStatusEnumMap, json['status']),
      parentWorkspaceId: json['parent_workspace_id'] as String?,
      imageIds:
          (json['image_ids'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList(),
    );

Map<String, dynamic> _$$CreateTaskImplToJson(_$CreateTaskImpl instance) =>
    <String, dynamic>{
      'project_id': instance.projectId,
      'title': instance.title,
      'description': instance.description,
      'status': _$TaskStatusEnumMap[instance.status],
      'parent_workspace_id': instance.parentWorkspaceId,
      'image_ids': instance.imageIds,
    };

_$UpdateTaskImpl _$$UpdateTaskImplFromJson(Map<String, dynamic> json) =>
    _$UpdateTaskImpl(
      title: json['title'] as String?,
      description: json['description'] as String?,
      status: $enumDecodeNullable(_$TaskStatusEnumMap, json['status']),
      parentWorkspaceId: json['parent_workspace_id'] as String?,
      imageIds:
          (json['image_ids'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList(),
    );

Map<String, dynamic> _$$UpdateTaskImplToJson(_$UpdateTaskImpl instance) =>
    <String, dynamic>{
      'title': instance.title,
      'description': instance.description,
      'status': _$TaskStatusEnumMap[instance.status],
      'parent_workspace_id': instance.parentWorkspaceId,
      'image_ids': instance.imageIds,
    };
