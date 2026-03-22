// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'task.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Task _$TaskFromJson(Map<String, dynamic> json) {
  return _Task.fromJson(json);
}

/// @nodoc
mixin _$Task {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'project_id')
  String get projectId => throw _privateConstructorUsedError;
  String get title => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  TaskStatus get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Task to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Task
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $TaskCopyWith<Task> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $TaskCopyWith<$Res> {
  factory $TaskCopyWith(Task value, $Res Function(Task) then) =
      _$TaskCopyWithImpl<$Res, Task>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$TaskCopyWithImpl<$Res, $Val extends Task>
    implements $TaskCopyWith<$Res> {
  _$TaskCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Task
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = null,
    Object? parentWorkspaceId = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            projectId:
                null == projectId
                    ? _value.projectId
                    : projectId // ignore: cast_nullable_to_non_nullable
                        as String,
            title:
                null == title
                    ? _value.title
                    : title // ignore: cast_nullable_to_non_nullable
                        as String,
            description:
                freezed == description
                    ? _value.description
                    : description // ignore: cast_nullable_to_non_nullable
                        as String?,
            status:
                null == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as TaskStatus,
            parentWorkspaceId:
                freezed == parentWorkspaceId
                    ? _value.parentWorkspaceId
                    : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                        as String?,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
            updatedAt:
                null == updatedAt
                    ? _value.updatedAt
                    : updatedAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$TaskImplCopyWith<$Res> implements $TaskCopyWith<$Res> {
  factory _$$TaskImplCopyWith(
    _$TaskImpl value,
    $Res Function(_$TaskImpl) then,
  ) = __$$TaskImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$$TaskImplCopyWithImpl<$Res>
    extends _$TaskCopyWithImpl<$Res, _$TaskImpl>
    implements _$$TaskImplCopyWith<$Res> {
  __$$TaskImplCopyWithImpl(_$TaskImpl _value, $Res Function(_$TaskImpl) _then)
    : super(_value, _then);

  /// Create a copy of Task
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = null,
    Object? parentWorkspaceId = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$TaskImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        projectId:
            null == projectId
                ? _value.projectId
                : projectId // ignore: cast_nullable_to_non_nullable
                    as String,
        title:
            null == title
                ? _value.title
                : title // ignore: cast_nullable_to_non_nullable
                    as String,
        description:
            freezed == description
                ? _value.description
                : description // ignore: cast_nullable_to_non_nullable
                    as String?,
        status:
            null == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as TaskStatus,
        parentWorkspaceId:
            freezed == parentWorkspaceId
                ? _value.parentWorkspaceId
                : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                    as String?,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
        updatedAt:
            null == updatedAt
                ? _value.updatedAt
                : updatedAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$TaskImpl implements _Task {
  const _$TaskImpl({
    required this.id,
    @JsonKey(name: 'project_id') required this.projectId,
    required this.title,
    this.description,
    required this.status,
    @JsonKey(name: 'parent_workspace_id') this.parentWorkspaceId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$TaskImpl.fromJson(Map<String, dynamic> json) =>
      _$$TaskImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'project_id')
  final String projectId;
  @override
  final String title;
  @override
  final String? description;
  @override
  final TaskStatus status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  final String? parentWorkspaceId;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  @override
  String toString() {
    return 'Task(id: $id, projectId: $projectId, title: $title, description: $description, status: $status, parentWorkspaceId: $parentWorkspaceId, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$TaskImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.projectId, projectId) ||
                other.projectId == projectId) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.parentWorkspaceId, parentWorkspaceId) ||
                other.parentWorkspaceId == parentWorkspaceId) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    projectId,
    title,
    description,
    status,
    parentWorkspaceId,
    createdAt,
    updatedAt,
  );

  /// Create a copy of Task
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$TaskImplCopyWith<_$TaskImpl> get copyWith =>
      __$$TaskImplCopyWithImpl<_$TaskImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$TaskImplToJson(this);
  }
}

abstract class _Task implements Task {
  const factory _Task({
    required final String id,
    @JsonKey(name: 'project_id') required final String projectId,
    required final String title,
    final String? description,
    required final TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') final String? parentWorkspaceId,
    required final String createdAt,
    required final String updatedAt,
  }) = _$TaskImpl;

  factory _Task.fromJson(Map<String, dynamic> json) = _$TaskImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'project_id')
  String get projectId;
  @override
  String get title;
  @override
  String? get description;
  @override
  TaskStatus get status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId;
  @override
  String get createdAt;
  @override
  String get updatedAt;

  /// Create a copy of Task
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$TaskImplCopyWith<_$TaskImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

TaskWithAttemptStatus _$TaskWithAttemptStatusFromJson(
  Map<String, dynamic> json,
) {
  return _TaskWithAttemptStatus.fromJson(json);
}

/// @nodoc
mixin _$TaskWithAttemptStatus {
  @JsonKey(name: 'has_in_progress_attempt')
  bool get hasInProgressAttempt => throw _privateConstructorUsedError;
  @JsonKey(name: 'last_attempt_failed')
  bool get lastAttemptFailed => throw _privateConstructorUsedError;
  String get executor => throw _privateConstructorUsedError;
  String? get variant => throw _privateConstructorUsedError;
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'project_id')
  String get projectId => throw _privateConstructorUsedError;
  String get title => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  TaskStatus get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this TaskWithAttemptStatus to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of TaskWithAttemptStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $TaskWithAttemptStatusCopyWith<TaskWithAttemptStatus> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $TaskWithAttemptStatusCopyWith<$Res> {
  factory $TaskWithAttemptStatusCopyWith(
    TaskWithAttemptStatus value,
    $Res Function(TaskWithAttemptStatus) then,
  ) = _$TaskWithAttemptStatusCopyWithImpl<$Res, TaskWithAttemptStatus>;
  @useResult
  $Res call({
    @JsonKey(name: 'has_in_progress_attempt') bool hasInProgressAttempt,
    @JsonKey(name: 'last_attempt_failed') bool lastAttemptFailed,
    String executor,
    String? variant,
    String id,
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$TaskWithAttemptStatusCopyWithImpl<
  $Res,
  $Val extends TaskWithAttemptStatus
>
    implements $TaskWithAttemptStatusCopyWith<$Res> {
  _$TaskWithAttemptStatusCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of TaskWithAttemptStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? hasInProgressAttempt = null,
    Object? lastAttemptFailed = null,
    Object? executor = null,
    Object? variant = freezed,
    Object? id = null,
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = null,
    Object? parentWorkspaceId = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _value.copyWith(
            hasInProgressAttempt:
                null == hasInProgressAttempt
                    ? _value.hasInProgressAttempt
                    : hasInProgressAttempt // ignore: cast_nullable_to_non_nullable
                        as bool,
            lastAttemptFailed:
                null == lastAttemptFailed
                    ? _value.lastAttemptFailed
                    : lastAttemptFailed // ignore: cast_nullable_to_non_nullable
                        as bool,
            executor:
                null == executor
                    ? _value.executor
                    : executor // ignore: cast_nullable_to_non_nullable
                        as String,
            variant:
                freezed == variant
                    ? _value.variant
                    : variant // ignore: cast_nullable_to_non_nullable
                        as String?,
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            projectId:
                null == projectId
                    ? _value.projectId
                    : projectId // ignore: cast_nullable_to_non_nullable
                        as String,
            title:
                null == title
                    ? _value.title
                    : title // ignore: cast_nullable_to_non_nullable
                        as String,
            description:
                freezed == description
                    ? _value.description
                    : description // ignore: cast_nullable_to_non_nullable
                        as String?,
            status:
                null == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as TaskStatus,
            parentWorkspaceId:
                freezed == parentWorkspaceId
                    ? _value.parentWorkspaceId
                    : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                        as String?,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
            updatedAt:
                null == updatedAt
                    ? _value.updatedAt
                    : updatedAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$TaskWithAttemptStatusImplCopyWith<$Res>
    implements $TaskWithAttemptStatusCopyWith<$Res> {
  factory _$$TaskWithAttemptStatusImplCopyWith(
    _$TaskWithAttemptStatusImpl value,
    $Res Function(_$TaskWithAttemptStatusImpl) then,
  ) = __$$TaskWithAttemptStatusImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'has_in_progress_attempt') bool hasInProgressAttempt,
    @JsonKey(name: 'last_attempt_failed') bool lastAttemptFailed,
    String executor,
    String? variant,
    String id,
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$$TaskWithAttemptStatusImplCopyWithImpl<$Res>
    extends
        _$TaskWithAttemptStatusCopyWithImpl<$Res, _$TaskWithAttemptStatusImpl>
    implements _$$TaskWithAttemptStatusImplCopyWith<$Res> {
  __$$TaskWithAttemptStatusImplCopyWithImpl(
    _$TaskWithAttemptStatusImpl _value,
    $Res Function(_$TaskWithAttemptStatusImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of TaskWithAttemptStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? hasInProgressAttempt = null,
    Object? lastAttemptFailed = null,
    Object? executor = null,
    Object? variant = freezed,
    Object? id = null,
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = null,
    Object? parentWorkspaceId = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$TaskWithAttemptStatusImpl(
        hasInProgressAttempt:
            null == hasInProgressAttempt
                ? _value.hasInProgressAttempt
                : hasInProgressAttempt // ignore: cast_nullable_to_non_nullable
                    as bool,
        lastAttemptFailed:
            null == lastAttemptFailed
                ? _value.lastAttemptFailed
                : lastAttemptFailed // ignore: cast_nullable_to_non_nullable
                    as bool,
        executor:
            null == executor
                ? _value.executor
                : executor // ignore: cast_nullable_to_non_nullable
                    as String,
        variant:
            freezed == variant
                ? _value.variant
                : variant // ignore: cast_nullable_to_non_nullable
                    as String?,
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        projectId:
            null == projectId
                ? _value.projectId
                : projectId // ignore: cast_nullable_to_non_nullable
                    as String,
        title:
            null == title
                ? _value.title
                : title // ignore: cast_nullable_to_non_nullable
                    as String,
        description:
            freezed == description
                ? _value.description
                : description // ignore: cast_nullable_to_non_nullable
                    as String?,
        status:
            null == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as TaskStatus,
        parentWorkspaceId:
            freezed == parentWorkspaceId
                ? _value.parentWorkspaceId
                : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                    as String?,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
        updatedAt:
            null == updatedAt
                ? _value.updatedAt
                : updatedAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$TaskWithAttemptStatusImpl implements _TaskWithAttemptStatus {
  const _$TaskWithAttemptStatusImpl({
    @JsonKey(name: 'has_in_progress_attempt')
    required this.hasInProgressAttempt,
    @JsonKey(name: 'last_attempt_failed') required this.lastAttemptFailed,
    required this.executor,
    this.variant,
    required this.id,
    @JsonKey(name: 'project_id') required this.projectId,
    required this.title,
    this.description,
    required this.status,
    @JsonKey(name: 'parent_workspace_id') this.parentWorkspaceId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$TaskWithAttemptStatusImpl.fromJson(Map<String, dynamic> json) =>
      _$$TaskWithAttemptStatusImplFromJson(json);

  @override
  @JsonKey(name: 'has_in_progress_attempt')
  final bool hasInProgressAttempt;
  @override
  @JsonKey(name: 'last_attempt_failed')
  final bool lastAttemptFailed;
  @override
  final String executor;
  @override
  final String? variant;
  @override
  final String id;
  @override
  @JsonKey(name: 'project_id')
  final String projectId;
  @override
  final String title;
  @override
  final String? description;
  @override
  final TaskStatus status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  final String? parentWorkspaceId;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  @override
  String toString() {
    return 'TaskWithAttemptStatus(hasInProgressAttempt: $hasInProgressAttempt, lastAttemptFailed: $lastAttemptFailed, executor: $executor, variant: $variant, id: $id, projectId: $projectId, title: $title, description: $description, status: $status, parentWorkspaceId: $parentWorkspaceId, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$TaskWithAttemptStatusImpl &&
            (identical(other.hasInProgressAttempt, hasInProgressAttempt) ||
                other.hasInProgressAttempt == hasInProgressAttempt) &&
            (identical(other.lastAttemptFailed, lastAttemptFailed) ||
                other.lastAttemptFailed == lastAttemptFailed) &&
            (identical(other.executor, executor) ||
                other.executor == executor) &&
            (identical(other.variant, variant) || other.variant == variant) &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.projectId, projectId) ||
                other.projectId == projectId) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.parentWorkspaceId, parentWorkspaceId) ||
                other.parentWorkspaceId == parentWorkspaceId) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    hasInProgressAttempt,
    lastAttemptFailed,
    executor,
    variant,
    id,
    projectId,
    title,
    description,
    status,
    parentWorkspaceId,
    createdAt,
    updatedAt,
  );

  /// Create a copy of TaskWithAttemptStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$TaskWithAttemptStatusImplCopyWith<_$TaskWithAttemptStatusImpl>
  get copyWith =>
      __$$TaskWithAttemptStatusImplCopyWithImpl<_$TaskWithAttemptStatusImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$TaskWithAttemptStatusImplToJson(this);
  }
}

abstract class _TaskWithAttemptStatus implements TaskWithAttemptStatus {
  const factory _TaskWithAttemptStatus({
    @JsonKey(name: 'has_in_progress_attempt')
    required final bool hasInProgressAttempt,
    @JsonKey(name: 'last_attempt_failed') required final bool lastAttemptFailed,
    required final String executor,
    final String? variant,
    required final String id,
    @JsonKey(name: 'project_id') required final String projectId,
    required final String title,
    final String? description,
    required final TaskStatus status,
    @JsonKey(name: 'parent_workspace_id') final String? parentWorkspaceId,
    required final String createdAt,
    required final String updatedAt,
  }) = _$TaskWithAttemptStatusImpl;

  factory _TaskWithAttemptStatus.fromJson(Map<String, dynamic> json) =
      _$TaskWithAttemptStatusImpl.fromJson;

  @override
  @JsonKey(name: 'has_in_progress_attempt')
  bool get hasInProgressAttempt;
  @override
  @JsonKey(name: 'last_attempt_failed')
  bool get lastAttemptFailed;
  @override
  String get executor;
  @override
  String? get variant;
  @override
  String get id;
  @override
  @JsonKey(name: 'project_id')
  String get projectId;
  @override
  String get title;
  @override
  String? get description;
  @override
  TaskStatus get status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId;
  @override
  String get createdAt;
  @override
  String get updatedAt;

  /// Create a copy of TaskWithAttemptStatus
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$TaskWithAttemptStatusImplCopyWith<_$TaskWithAttemptStatusImpl>
  get copyWith => throw _privateConstructorUsedError;
}

CreateTask _$CreateTaskFromJson(Map<String, dynamic> json) {
  return _CreateTask.fromJson(json);
}

/// @nodoc
mixin _$CreateTask {
  @JsonKey(name: 'project_id')
  String get projectId => throw _privateConstructorUsedError;
  String get title => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  TaskStatus? get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId => throw _privateConstructorUsedError;
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds => throw _privateConstructorUsedError;

  /// Serializes this CreateTask to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of CreateTask
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $CreateTaskCopyWith<CreateTask> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CreateTaskCopyWith<$Res> {
  factory $CreateTaskCopyWith(
    CreateTask value,
    $Res Function(CreateTask) then,
  ) = _$CreateTaskCopyWithImpl<$Res, CreateTask>;
  @useResult
  $Res call({
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  });
}

/// @nodoc
class _$CreateTaskCopyWithImpl<$Res, $Val extends CreateTask>
    implements $CreateTaskCopyWith<$Res> {
  _$CreateTaskCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of CreateTask
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = freezed,
    Object? parentWorkspaceId = freezed,
    Object? imageIds = freezed,
  }) {
    return _then(
      _value.copyWith(
            projectId:
                null == projectId
                    ? _value.projectId
                    : projectId // ignore: cast_nullable_to_non_nullable
                        as String,
            title:
                null == title
                    ? _value.title
                    : title // ignore: cast_nullable_to_non_nullable
                        as String,
            description:
                freezed == description
                    ? _value.description
                    : description // ignore: cast_nullable_to_non_nullable
                        as String?,
            status:
                freezed == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as TaskStatus?,
            parentWorkspaceId:
                freezed == parentWorkspaceId
                    ? _value.parentWorkspaceId
                    : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                        as String?,
            imageIds:
                freezed == imageIds
                    ? _value.imageIds
                    : imageIds // ignore: cast_nullable_to_non_nullable
                        as List<String>?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$CreateTaskImplCopyWith<$Res>
    implements $CreateTaskCopyWith<$Res> {
  factory _$$CreateTaskImplCopyWith(
    _$CreateTaskImpl value,
    $Res Function(_$CreateTaskImpl) then,
  ) = __$$CreateTaskImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'project_id') String projectId,
    String title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  });
}

/// @nodoc
class __$$CreateTaskImplCopyWithImpl<$Res>
    extends _$CreateTaskCopyWithImpl<$Res, _$CreateTaskImpl>
    implements _$$CreateTaskImplCopyWith<$Res> {
  __$$CreateTaskImplCopyWithImpl(
    _$CreateTaskImpl _value,
    $Res Function(_$CreateTaskImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of CreateTask
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? projectId = null,
    Object? title = null,
    Object? description = freezed,
    Object? status = freezed,
    Object? parentWorkspaceId = freezed,
    Object? imageIds = freezed,
  }) {
    return _then(
      _$CreateTaskImpl(
        projectId:
            null == projectId
                ? _value.projectId
                : projectId // ignore: cast_nullable_to_non_nullable
                    as String,
        title:
            null == title
                ? _value.title
                : title // ignore: cast_nullable_to_non_nullable
                    as String,
        description:
            freezed == description
                ? _value.description
                : description // ignore: cast_nullable_to_non_nullable
                    as String?,
        status:
            freezed == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as TaskStatus?,
        parentWorkspaceId:
            freezed == parentWorkspaceId
                ? _value.parentWorkspaceId
                : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                    as String?,
        imageIds:
            freezed == imageIds
                ? _value._imageIds
                : imageIds // ignore: cast_nullable_to_non_nullable
                    as List<String>?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$CreateTaskImpl implements _CreateTask {
  const _$CreateTaskImpl({
    @JsonKey(name: 'project_id') required this.projectId,
    required this.title,
    this.description,
    this.status,
    @JsonKey(name: 'parent_workspace_id') this.parentWorkspaceId,
    @JsonKey(name: 'image_ids') final List<String>? imageIds,
  }) : _imageIds = imageIds;

  factory _$CreateTaskImpl.fromJson(Map<String, dynamic> json) =>
      _$$CreateTaskImplFromJson(json);

  @override
  @JsonKey(name: 'project_id')
  final String projectId;
  @override
  final String title;
  @override
  final String? description;
  @override
  final TaskStatus? status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  final String? parentWorkspaceId;
  final List<String>? _imageIds;
  @override
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds {
    final value = _imageIds;
    if (value == null) return null;
    if (_imageIds is EqualUnmodifiableListView) return _imageIds;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  String toString() {
    return 'CreateTask(projectId: $projectId, title: $title, description: $description, status: $status, parentWorkspaceId: $parentWorkspaceId, imageIds: $imageIds)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CreateTaskImpl &&
            (identical(other.projectId, projectId) ||
                other.projectId == projectId) &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.parentWorkspaceId, parentWorkspaceId) ||
                other.parentWorkspaceId == parentWorkspaceId) &&
            const DeepCollectionEquality().equals(other._imageIds, _imageIds));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    projectId,
    title,
    description,
    status,
    parentWorkspaceId,
    const DeepCollectionEquality().hash(_imageIds),
  );

  /// Create a copy of CreateTask
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$CreateTaskImplCopyWith<_$CreateTaskImpl> get copyWith =>
      __$$CreateTaskImplCopyWithImpl<_$CreateTaskImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CreateTaskImplToJson(this);
  }
}

abstract class _CreateTask implements CreateTask {
  const factory _CreateTask({
    @JsonKey(name: 'project_id') required final String projectId,
    required final String title,
    final String? description,
    final TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') final String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') final List<String>? imageIds,
  }) = _$CreateTaskImpl;

  factory _CreateTask.fromJson(Map<String, dynamic> json) =
      _$CreateTaskImpl.fromJson;

  @override
  @JsonKey(name: 'project_id')
  String get projectId;
  @override
  String get title;
  @override
  String? get description;
  @override
  TaskStatus? get status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId;
  @override
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds;

  /// Create a copy of CreateTask
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$CreateTaskImplCopyWith<_$CreateTaskImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

UpdateTask _$UpdateTaskFromJson(Map<String, dynamic> json) {
  return _UpdateTask.fromJson(json);
}

/// @nodoc
mixin _$UpdateTask {
  String? get title => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;
  TaskStatus? get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId => throw _privateConstructorUsedError;
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds => throw _privateConstructorUsedError;

  /// Serializes this UpdateTask to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of UpdateTask
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $UpdateTaskCopyWith<UpdateTask> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UpdateTaskCopyWith<$Res> {
  factory $UpdateTaskCopyWith(
    UpdateTask value,
    $Res Function(UpdateTask) then,
  ) = _$UpdateTaskCopyWithImpl<$Res, UpdateTask>;
  @useResult
  $Res call({
    String? title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  });
}

/// @nodoc
class _$UpdateTaskCopyWithImpl<$Res, $Val extends UpdateTask>
    implements $UpdateTaskCopyWith<$Res> {
  _$UpdateTaskCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of UpdateTask
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? title = freezed,
    Object? description = freezed,
    Object? status = freezed,
    Object? parentWorkspaceId = freezed,
    Object? imageIds = freezed,
  }) {
    return _then(
      _value.copyWith(
            title:
                freezed == title
                    ? _value.title
                    : title // ignore: cast_nullable_to_non_nullable
                        as String?,
            description:
                freezed == description
                    ? _value.description
                    : description // ignore: cast_nullable_to_non_nullable
                        as String?,
            status:
                freezed == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as TaskStatus?,
            parentWorkspaceId:
                freezed == parentWorkspaceId
                    ? _value.parentWorkspaceId
                    : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                        as String?,
            imageIds:
                freezed == imageIds
                    ? _value.imageIds
                    : imageIds // ignore: cast_nullable_to_non_nullable
                        as List<String>?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$UpdateTaskImplCopyWith<$Res>
    implements $UpdateTaskCopyWith<$Res> {
  factory _$$UpdateTaskImplCopyWith(
    _$UpdateTaskImpl value,
    $Res Function(_$UpdateTaskImpl) then,
  ) = __$$UpdateTaskImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String? title,
    String? description,
    TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') List<String>? imageIds,
  });
}

/// @nodoc
class __$$UpdateTaskImplCopyWithImpl<$Res>
    extends _$UpdateTaskCopyWithImpl<$Res, _$UpdateTaskImpl>
    implements _$$UpdateTaskImplCopyWith<$Res> {
  __$$UpdateTaskImplCopyWithImpl(
    _$UpdateTaskImpl _value,
    $Res Function(_$UpdateTaskImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of UpdateTask
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? title = freezed,
    Object? description = freezed,
    Object? status = freezed,
    Object? parentWorkspaceId = freezed,
    Object? imageIds = freezed,
  }) {
    return _then(
      _$UpdateTaskImpl(
        title:
            freezed == title
                ? _value.title
                : title // ignore: cast_nullable_to_non_nullable
                    as String?,
        description:
            freezed == description
                ? _value.description
                : description // ignore: cast_nullable_to_non_nullable
                    as String?,
        status:
            freezed == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as TaskStatus?,
        parentWorkspaceId:
            freezed == parentWorkspaceId
                ? _value.parentWorkspaceId
                : parentWorkspaceId // ignore: cast_nullable_to_non_nullable
                    as String?,
        imageIds:
            freezed == imageIds
                ? _value._imageIds
                : imageIds // ignore: cast_nullable_to_non_nullable
                    as List<String>?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$UpdateTaskImpl implements _UpdateTask {
  const _$UpdateTaskImpl({
    this.title,
    this.description,
    this.status,
    @JsonKey(name: 'parent_workspace_id') this.parentWorkspaceId,
    @JsonKey(name: 'image_ids') final List<String>? imageIds,
  }) : _imageIds = imageIds;

  factory _$UpdateTaskImpl.fromJson(Map<String, dynamic> json) =>
      _$$UpdateTaskImplFromJson(json);

  @override
  final String? title;
  @override
  final String? description;
  @override
  final TaskStatus? status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  final String? parentWorkspaceId;
  final List<String>? _imageIds;
  @override
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds {
    final value = _imageIds;
    if (value == null) return null;
    if (_imageIds is EqualUnmodifiableListView) return _imageIds;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  String toString() {
    return 'UpdateTask(title: $title, description: $description, status: $status, parentWorkspaceId: $parentWorkspaceId, imageIds: $imageIds)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UpdateTaskImpl &&
            (identical(other.title, title) || other.title == title) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.parentWorkspaceId, parentWorkspaceId) ||
                other.parentWorkspaceId == parentWorkspaceId) &&
            const DeepCollectionEquality().equals(other._imageIds, _imageIds));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    title,
    description,
    status,
    parentWorkspaceId,
    const DeepCollectionEquality().hash(_imageIds),
  );

  /// Create a copy of UpdateTask
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$UpdateTaskImplCopyWith<_$UpdateTaskImpl> get copyWith =>
      __$$UpdateTaskImplCopyWithImpl<_$UpdateTaskImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$UpdateTaskImplToJson(this);
  }
}

abstract class _UpdateTask implements UpdateTask {
  const factory _UpdateTask({
    final String? title,
    final String? description,
    final TaskStatus? status,
    @JsonKey(name: 'parent_workspace_id') final String? parentWorkspaceId,
    @JsonKey(name: 'image_ids') final List<String>? imageIds,
  }) = _$UpdateTaskImpl;

  factory _UpdateTask.fromJson(Map<String, dynamic> json) =
      _$UpdateTaskImpl.fromJson;

  @override
  String? get title;
  @override
  String? get description;
  @override
  TaskStatus? get status;
  @override
  @JsonKey(name: 'parent_workspace_id')
  String? get parentWorkspaceId;
  @override
  @JsonKey(name: 'image_ids')
  List<String>? get imageIds;

  /// Create a copy of UpdateTask
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$UpdateTaskImplCopyWith<_$UpdateTaskImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
