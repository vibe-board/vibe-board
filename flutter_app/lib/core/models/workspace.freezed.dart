// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'workspace.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Workspace _$WorkspaceFromJson(Map<String, dynamic> json) {
  return _Workspace.fromJson(json);
}

/// @nodoc
mixin _$Workspace {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'task_id')
  String get taskId => throw _privateConstructorUsedError;
  @JsonKey(name: 'container_ref')
  String? get containerRef => throw _privateConstructorUsedError;
  String get branch => throw _privateConstructorUsedError;
  @JsonKey(name: 'agent_working_dir')
  String? get agentWorkingDir => throw _privateConstructorUsedError;
  @JsonKey(name: 'setup_completed_at')
  String? get setupCompletedAt => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;
  bool get archived => throw _privateConstructorUsedError;
  bool get pinned => throw _privateConstructorUsedError;
  String? get name => throw _privateConstructorUsedError;
  WorkspaceMode get mode => throw _privateConstructorUsedError;

  /// Serializes this Workspace to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Workspace
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $WorkspaceCopyWith<Workspace> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $WorkspaceCopyWith<$Res> {
  factory $WorkspaceCopyWith(Workspace value, $Res Function(Workspace) then) =
      _$WorkspaceCopyWithImpl<$Res, Workspace>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'task_id') String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    String createdAt,
    String updatedAt,
    bool archived,
    bool pinned,
    String? name,
    WorkspaceMode mode,
  });
}

/// @nodoc
class _$WorkspaceCopyWithImpl<$Res, $Val extends Workspace>
    implements $WorkspaceCopyWith<$Res> {
  _$WorkspaceCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Workspace
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? taskId = null,
    Object? containerRef = freezed,
    Object? branch = null,
    Object? agentWorkingDir = freezed,
    Object? setupCompletedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? archived = null,
    Object? pinned = null,
    Object? name = freezed,
    Object? mode = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            taskId:
                null == taskId
                    ? _value.taskId
                    : taskId // ignore: cast_nullable_to_non_nullable
                        as String,
            containerRef:
                freezed == containerRef
                    ? _value.containerRef
                    : containerRef // ignore: cast_nullable_to_non_nullable
                        as String?,
            branch:
                null == branch
                    ? _value.branch
                    : branch // ignore: cast_nullable_to_non_nullable
                        as String,
            agentWorkingDir:
                freezed == agentWorkingDir
                    ? _value.agentWorkingDir
                    : agentWorkingDir // ignore: cast_nullable_to_non_nullable
                        as String?,
            setupCompletedAt:
                freezed == setupCompletedAt
                    ? _value.setupCompletedAt
                    : setupCompletedAt // ignore: cast_nullable_to_non_nullable
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
            archived:
                null == archived
                    ? _value.archived
                    : archived // ignore: cast_nullable_to_non_nullable
                        as bool,
            pinned:
                null == pinned
                    ? _value.pinned
                    : pinned // ignore: cast_nullable_to_non_nullable
                        as bool,
            name:
                freezed == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String?,
            mode:
                null == mode
                    ? _value.mode
                    : mode // ignore: cast_nullable_to_non_nullable
                        as WorkspaceMode,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$WorkspaceImplCopyWith<$Res>
    implements $WorkspaceCopyWith<$Res> {
  factory _$$WorkspaceImplCopyWith(
    _$WorkspaceImpl value,
    $Res Function(_$WorkspaceImpl) then,
  ) = __$$WorkspaceImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'task_id') String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    String createdAt,
    String updatedAt,
    bool archived,
    bool pinned,
    String? name,
    WorkspaceMode mode,
  });
}

/// @nodoc
class __$$WorkspaceImplCopyWithImpl<$Res>
    extends _$WorkspaceCopyWithImpl<$Res, _$WorkspaceImpl>
    implements _$$WorkspaceImplCopyWith<$Res> {
  __$$WorkspaceImplCopyWithImpl(
    _$WorkspaceImpl _value,
    $Res Function(_$WorkspaceImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Workspace
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? taskId = null,
    Object? containerRef = freezed,
    Object? branch = null,
    Object? agentWorkingDir = freezed,
    Object? setupCompletedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? archived = null,
    Object? pinned = null,
    Object? name = freezed,
    Object? mode = null,
  }) {
    return _then(
      _$WorkspaceImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        taskId:
            null == taskId
                ? _value.taskId
                : taskId // ignore: cast_nullable_to_non_nullable
                    as String,
        containerRef:
            freezed == containerRef
                ? _value.containerRef
                : containerRef // ignore: cast_nullable_to_non_nullable
                    as String?,
        branch:
            null == branch
                ? _value.branch
                : branch // ignore: cast_nullable_to_non_nullable
                    as String,
        agentWorkingDir:
            freezed == agentWorkingDir
                ? _value.agentWorkingDir
                : agentWorkingDir // ignore: cast_nullable_to_non_nullable
                    as String?,
        setupCompletedAt:
            freezed == setupCompletedAt
                ? _value.setupCompletedAt
                : setupCompletedAt // ignore: cast_nullable_to_non_nullable
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
        archived:
            null == archived
                ? _value.archived
                : archived // ignore: cast_nullable_to_non_nullable
                    as bool,
        pinned:
            null == pinned
                ? _value.pinned
                : pinned // ignore: cast_nullable_to_non_nullable
                    as bool,
        name:
            freezed == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String?,
        mode:
            null == mode
                ? _value.mode
                : mode // ignore: cast_nullable_to_non_nullable
                    as WorkspaceMode,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$WorkspaceImpl implements _Workspace {
  const _$WorkspaceImpl({
    required this.id,
    @JsonKey(name: 'task_id') required this.taskId,
    @JsonKey(name: 'container_ref') this.containerRef,
    required this.branch,
    @JsonKey(name: 'agent_working_dir') this.agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') this.setupCompletedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.archived,
    required this.pinned,
    this.name,
    required this.mode,
  });

  factory _$WorkspaceImpl.fromJson(Map<String, dynamic> json) =>
      _$$WorkspaceImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'task_id')
  final String taskId;
  @override
  @JsonKey(name: 'container_ref')
  final String? containerRef;
  @override
  final String branch;
  @override
  @JsonKey(name: 'agent_working_dir')
  final String? agentWorkingDir;
  @override
  @JsonKey(name: 'setup_completed_at')
  final String? setupCompletedAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final bool archived;
  @override
  final bool pinned;
  @override
  final String? name;
  @override
  final WorkspaceMode mode;

  @override
  String toString() {
    return 'Workspace(id: $id, taskId: $taskId, containerRef: $containerRef, branch: $branch, agentWorkingDir: $agentWorkingDir, setupCompletedAt: $setupCompletedAt, createdAt: $createdAt, updatedAt: $updatedAt, archived: $archived, pinned: $pinned, name: $name, mode: $mode)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$WorkspaceImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.taskId, taskId) || other.taskId == taskId) &&
            (identical(other.containerRef, containerRef) ||
                other.containerRef == containerRef) &&
            (identical(other.branch, branch) || other.branch == branch) &&
            (identical(other.agentWorkingDir, agentWorkingDir) ||
                other.agentWorkingDir == agentWorkingDir) &&
            (identical(other.setupCompletedAt, setupCompletedAt) ||
                other.setupCompletedAt == setupCompletedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.archived, archived) ||
                other.archived == archived) &&
            (identical(other.pinned, pinned) || other.pinned == pinned) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.mode, mode) || other.mode == mode));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    taskId,
    containerRef,
    branch,
    agentWorkingDir,
    setupCompletedAt,
    createdAt,
    updatedAt,
    archived,
    pinned,
    name,
    mode,
  );

  /// Create a copy of Workspace
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$WorkspaceImplCopyWith<_$WorkspaceImpl> get copyWith =>
      __$$WorkspaceImplCopyWithImpl<_$WorkspaceImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$WorkspaceImplToJson(this);
  }
}

abstract class _Workspace implements Workspace {
  const factory _Workspace({
    required final String id,
    @JsonKey(name: 'task_id') required final String taskId,
    @JsonKey(name: 'container_ref') final String? containerRef,
    required final String branch,
    @JsonKey(name: 'agent_working_dir') final String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') final String? setupCompletedAt,
    required final String createdAt,
    required final String updatedAt,
    required final bool archived,
    required final bool pinned,
    final String? name,
    required final WorkspaceMode mode,
  }) = _$WorkspaceImpl;

  factory _Workspace.fromJson(Map<String, dynamic> json) =
      _$WorkspaceImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'task_id')
  String get taskId;
  @override
  @JsonKey(name: 'container_ref')
  String? get containerRef;
  @override
  String get branch;
  @override
  @JsonKey(name: 'agent_working_dir')
  String? get agentWorkingDir;
  @override
  @JsonKey(name: 'setup_completed_at')
  String? get setupCompletedAt;
  @override
  String get createdAt;
  @override
  String get updatedAt;
  @override
  bool get archived;
  @override
  bool get pinned;
  @override
  String? get name;
  @override
  WorkspaceMode get mode;

  /// Create a copy of Workspace
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$WorkspaceImplCopyWith<_$WorkspaceImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

WorkspaceWithStatus _$WorkspaceWithStatusFromJson(Map<String, dynamic> json) {
  return _WorkspaceWithStatus.fromJson(json);
}

/// @nodoc
mixin _$WorkspaceWithStatus {
  @JsonKey(name: 'is_running')
  bool get isRunning => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_errored')
  bool get isErrored => throw _privateConstructorUsedError;
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'task_id')
  String get taskId => throw _privateConstructorUsedError;
  @JsonKey(name: 'container_ref')
  String? get containerRef => throw _privateConstructorUsedError;
  String get branch => throw _privateConstructorUsedError;
  @JsonKey(name: 'agent_working_dir')
  String? get agentWorkingDir => throw _privateConstructorUsedError;
  @JsonKey(name: 'setup_completed_at')
  String? get setupCompletedAt => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;
  bool get archived => throw _privateConstructorUsedError;
  bool get pinned => throw _privateConstructorUsedError;
  String? get name => throw _privateConstructorUsedError;
  WorkspaceMode get mode => throw _privateConstructorUsedError;

  /// Serializes this WorkspaceWithStatus to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of WorkspaceWithStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $WorkspaceWithStatusCopyWith<WorkspaceWithStatus> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $WorkspaceWithStatusCopyWith<$Res> {
  factory $WorkspaceWithStatusCopyWith(
    WorkspaceWithStatus value,
    $Res Function(WorkspaceWithStatus) then,
  ) = _$WorkspaceWithStatusCopyWithImpl<$Res, WorkspaceWithStatus>;
  @useResult
  $Res call({
    @JsonKey(name: 'is_running') bool isRunning,
    @JsonKey(name: 'is_errored') bool isErrored,
    String id,
    @JsonKey(name: 'task_id') String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    String createdAt,
    String updatedAt,
    bool archived,
    bool pinned,
    String? name,
    WorkspaceMode mode,
  });
}

/// @nodoc
class _$WorkspaceWithStatusCopyWithImpl<$Res, $Val extends WorkspaceWithStatus>
    implements $WorkspaceWithStatusCopyWith<$Res> {
  _$WorkspaceWithStatusCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of WorkspaceWithStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? isRunning = null,
    Object? isErrored = null,
    Object? id = null,
    Object? taskId = null,
    Object? containerRef = freezed,
    Object? branch = null,
    Object? agentWorkingDir = freezed,
    Object? setupCompletedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? archived = null,
    Object? pinned = null,
    Object? name = freezed,
    Object? mode = null,
  }) {
    return _then(
      _value.copyWith(
            isRunning:
                null == isRunning
                    ? _value.isRunning
                    : isRunning // ignore: cast_nullable_to_non_nullable
                        as bool,
            isErrored:
                null == isErrored
                    ? _value.isErrored
                    : isErrored // ignore: cast_nullable_to_non_nullable
                        as bool,
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            taskId:
                null == taskId
                    ? _value.taskId
                    : taskId // ignore: cast_nullable_to_non_nullable
                        as String,
            containerRef:
                freezed == containerRef
                    ? _value.containerRef
                    : containerRef // ignore: cast_nullable_to_non_nullable
                        as String?,
            branch:
                null == branch
                    ? _value.branch
                    : branch // ignore: cast_nullable_to_non_nullable
                        as String,
            agentWorkingDir:
                freezed == agentWorkingDir
                    ? _value.agentWorkingDir
                    : agentWorkingDir // ignore: cast_nullable_to_non_nullable
                        as String?,
            setupCompletedAt:
                freezed == setupCompletedAt
                    ? _value.setupCompletedAt
                    : setupCompletedAt // ignore: cast_nullable_to_non_nullable
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
            archived:
                null == archived
                    ? _value.archived
                    : archived // ignore: cast_nullable_to_non_nullable
                        as bool,
            pinned:
                null == pinned
                    ? _value.pinned
                    : pinned // ignore: cast_nullable_to_non_nullable
                        as bool,
            name:
                freezed == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String?,
            mode:
                null == mode
                    ? _value.mode
                    : mode // ignore: cast_nullable_to_non_nullable
                        as WorkspaceMode,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$WorkspaceWithStatusImplCopyWith<$Res>
    implements $WorkspaceWithStatusCopyWith<$Res> {
  factory _$$WorkspaceWithStatusImplCopyWith(
    _$WorkspaceWithStatusImpl value,
    $Res Function(_$WorkspaceWithStatusImpl) then,
  ) = __$$WorkspaceWithStatusImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'is_running') bool isRunning,
    @JsonKey(name: 'is_errored') bool isErrored,
    String id,
    @JsonKey(name: 'task_id') String taskId,
    @JsonKey(name: 'container_ref') String? containerRef,
    String branch,
    @JsonKey(name: 'agent_working_dir') String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') String? setupCompletedAt,
    String createdAt,
    String updatedAt,
    bool archived,
    bool pinned,
    String? name,
    WorkspaceMode mode,
  });
}

/// @nodoc
class __$$WorkspaceWithStatusImplCopyWithImpl<$Res>
    extends _$WorkspaceWithStatusCopyWithImpl<$Res, _$WorkspaceWithStatusImpl>
    implements _$$WorkspaceWithStatusImplCopyWith<$Res> {
  __$$WorkspaceWithStatusImplCopyWithImpl(
    _$WorkspaceWithStatusImpl _value,
    $Res Function(_$WorkspaceWithStatusImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of WorkspaceWithStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? isRunning = null,
    Object? isErrored = null,
    Object? id = null,
    Object? taskId = null,
    Object? containerRef = freezed,
    Object? branch = null,
    Object? agentWorkingDir = freezed,
    Object? setupCompletedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
    Object? archived = null,
    Object? pinned = null,
    Object? name = freezed,
    Object? mode = null,
  }) {
    return _then(
      _$WorkspaceWithStatusImpl(
        isRunning:
            null == isRunning
                ? _value.isRunning
                : isRunning // ignore: cast_nullable_to_non_nullable
                    as bool,
        isErrored:
            null == isErrored
                ? _value.isErrored
                : isErrored // ignore: cast_nullable_to_non_nullable
                    as bool,
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        taskId:
            null == taskId
                ? _value.taskId
                : taskId // ignore: cast_nullable_to_non_nullable
                    as String,
        containerRef:
            freezed == containerRef
                ? _value.containerRef
                : containerRef // ignore: cast_nullable_to_non_nullable
                    as String?,
        branch:
            null == branch
                ? _value.branch
                : branch // ignore: cast_nullable_to_non_nullable
                    as String,
        agentWorkingDir:
            freezed == agentWorkingDir
                ? _value.agentWorkingDir
                : agentWorkingDir // ignore: cast_nullable_to_non_nullable
                    as String?,
        setupCompletedAt:
            freezed == setupCompletedAt
                ? _value.setupCompletedAt
                : setupCompletedAt // ignore: cast_nullable_to_non_nullable
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
        archived:
            null == archived
                ? _value.archived
                : archived // ignore: cast_nullable_to_non_nullable
                    as bool,
        pinned:
            null == pinned
                ? _value.pinned
                : pinned // ignore: cast_nullable_to_non_nullable
                    as bool,
        name:
            freezed == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String?,
        mode:
            null == mode
                ? _value.mode
                : mode // ignore: cast_nullable_to_non_nullable
                    as WorkspaceMode,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$WorkspaceWithStatusImpl implements _WorkspaceWithStatus {
  const _$WorkspaceWithStatusImpl({
    @JsonKey(name: 'is_running') required this.isRunning,
    @JsonKey(name: 'is_errored') required this.isErrored,
    required this.id,
    @JsonKey(name: 'task_id') required this.taskId,
    @JsonKey(name: 'container_ref') this.containerRef,
    required this.branch,
    @JsonKey(name: 'agent_working_dir') this.agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') this.setupCompletedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.archived,
    required this.pinned,
    this.name,
    required this.mode,
  });

  factory _$WorkspaceWithStatusImpl.fromJson(Map<String, dynamic> json) =>
      _$$WorkspaceWithStatusImplFromJson(json);

  @override
  @JsonKey(name: 'is_running')
  final bool isRunning;
  @override
  @JsonKey(name: 'is_errored')
  final bool isErrored;
  @override
  final String id;
  @override
  @JsonKey(name: 'task_id')
  final String taskId;
  @override
  @JsonKey(name: 'container_ref')
  final String? containerRef;
  @override
  final String branch;
  @override
  @JsonKey(name: 'agent_working_dir')
  final String? agentWorkingDir;
  @override
  @JsonKey(name: 'setup_completed_at')
  final String? setupCompletedAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;
  @override
  final bool archived;
  @override
  final bool pinned;
  @override
  final String? name;
  @override
  final WorkspaceMode mode;

  @override
  String toString() {
    return 'WorkspaceWithStatus(isRunning: $isRunning, isErrored: $isErrored, id: $id, taskId: $taskId, containerRef: $containerRef, branch: $branch, agentWorkingDir: $agentWorkingDir, setupCompletedAt: $setupCompletedAt, createdAt: $createdAt, updatedAt: $updatedAt, archived: $archived, pinned: $pinned, name: $name, mode: $mode)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$WorkspaceWithStatusImpl &&
            (identical(other.isRunning, isRunning) ||
                other.isRunning == isRunning) &&
            (identical(other.isErrored, isErrored) ||
                other.isErrored == isErrored) &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.taskId, taskId) || other.taskId == taskId) &&
            (identical(other.containerRef, containerRef) ||
                other.containerRef == containerRef) &&
            (identical(other.branch, branch) || other.branch == branch) &&
            (identical(other.agentWorkingDir, agentWorkingDir) ||
                other.agentWorkingDir == agentWorkingDir) &&
            (identical(other.setupCompletedAt, setupCompletedAt) ||
                other.setupCompletedAt == setupCompletedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.archived, archived) ||
                other.archived == archived) &&
            (identical(other.pinned, pinned) || other.pinned == pinned) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.mode, mode) || other.mode == mode));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    isRunning,
    isErrored,
    id,
    taskId,
    containerRef,
    branch,
    agentWorkingDir,
    setupCompletedAt,
    createdAt,
    updatedAt,
    archived,
    pinned,
    name,
    mode,
  );

  /// Create a copy of WorkspaceWithStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$WorkspaceWithStatusImplCopyWith<_$WorkspaceWithStatusImpl> get copyWith =>
      __$$WorkspaceWithStatusImplCopyWithImpl<_$WorkspaceWithStatusImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$WorkspaceWithStatusImplToJson(this);
  }
}

abstract class _WorkspaceWithStatus implements WorkspaceWithStatus {
  const factory _WorkspaceWithStatus({
    @JsonKey(name: 'is_running') required final bool isRunning,
    @JsonKey(name: 'is_errored') required final bool isErrored,
    required final String id,
    @JsonKey(name: 'task_id') required final String taskId,
    @JsonKey(name: 'container_ref') final String? containerRef,
    required final String branch,
    @JsonKey(name: 'agent_working_dir') final String? agentWorkingDir,
    @JsonKey(name: 'setup_completed_at') final String? setupCompletedAt,
    required final String createdAt,
    required final String updatedAt,
    required final bool archived,
    required final bool pinned,
    final String? name,
    required final WorkspaceMode mode,
  }) = _$WorkspaceWithStatusImpl;

  factory _WorkspaceWithStatus.fromJson(Map<String, dynamic> json) =
      _$WorkspaceWithStatusImpl.fromJson;

  @override
  @JsonKey(name: 'is_running')
  bool get isRunning;
  @override
  @JsonKey(name: 'is_errored')
  bool get isErrored;
  @override
  String get id;
  @override
  @JsonKey(name: 'task_id')
  String get taskId;
  @override
  @JsonKey(name: 'container_ref')
  String? get containerRef;
  @override
  String get branch;
  @override
  @JsonKey(name: 'agent_working_dir')
  String? get agentWorkingDir;
  @override
  @JsonKey(name: 'setup_completed_at')
  String? get setupCompletedAt;
  @override
  String get createdAt;
  @override
  String get updatedAt;
  @override
  bool get archived;
  @override
  bool get pinned;
  @override
  String? get name;
  @override
  WorkspaceMode get mode;

  /// Create a copy of WorkspaceWithStatus
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$WorkspaceWithStatusImplCopyWith<_$WorkspaceWithStatusImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

WorkspaceSummary _$WorkspaceSummaryFromJson(Map<String, dynamic> json) {
  return _WorkspaceSummary.fromJson(json);
}

/// @nodoc
mixin _$WorkspaceSummary {
  @JsonKey(name: 'workspace_id')
  String get workspaceId => throw _privateConstructorUsedError;
  @JsonKey(name: 'latest_session_id')
  String? get latestSessionId => throw _privateConstructorUsedError;
  @JsonKey(name: 'has_pending_approval')
  bool get hasPendingApproval => throw _privateConstructorUsedError;
  @JsonKey(name: 'files_changed')
  int? get filesChanged => throw _privateConstructorUsedError;
  @JsonKey(name: 'lines_added')
  int? get linesAdded => throw _privateConstructorUsedError;
  @JsonKey(name: 'lines_removed')
  int? get linesRemoved => throw _privateConstructorUsedError;
  @JsonKey(name: 'latest_process_completed_at')
  String? get latestProcessCompletedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'latest_process_status')
  ExecutionProcessStatus? get latestProcessStatus =>
      throw _privateConstructorUsedError;
  @JsonKey(name: 'has_running_dev_server')
  bool get hasRunningDevServer => throw _privateConstructorUsedError;
  @JsonKey(name: 'has_unseen_turns')
  bool get hasUnseenTurns => throw _privateConstructorUsedError;
  @JsonKey(name: 'pr_status')
  MergeStatus? get prStatus => throw _privateConstructorUsedError;

  /// Serializes this WorkspaceSummary to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of WorkspaceSummary
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $WorkspaceSummaryCopyWith<WorkspaceSummary> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $WorkspaceSummaryCopyWith<$Res> {
  factory $WorkspaceSummaryCopyWith(
    WorkspaceSummary value,
    $Res Function(WorkspaceSummary) then,
  ) = _$WorkspaceSummaryCopyWithImpl<$Res, WorkspaceSummary>;
  @useResult
  $Res call({
    @JsonKey(name: 'workspace_id') String workspaceId,
    @JsonKey(name: 'latest_session_id') String? latestSessionId,
    @JsonKey(name: 'has_pending_approval') bool hasPendingApproval,
    @JsonKey(name: 'files_changed') int? filesChanged,
    @JsonKey(name: 'lines_added') int? linesAdded,
    @JsonKey(name: 'lines_removed') int? linesRemoved,
    @JsonKey(name: 'latest_process_completed_at')
    String? latestProcessCompletedAt,
    @JsonKey(name: 'latest_process_status')
    ExecutionProcessStatus? latestProcessStatus,
    @JsonKey(name: 'has_running_dev_server') bool hasRunningDevServer,
    @JsonKey(name: 'has_unseen_turns') bool hasUnseenTurns,
    @JsonKey(name: 'pr_status') MergeStatus? prStatus,
  });
}

/// @nodoc
class _$WorkspaceSummaryCopyWithImpl<$Res, $Val extends WorkspaceSummary>
    implements $WorkspaceSummaryCopyWith<$Res> {
  _$WorkspaceSummaryCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of WorkspaceSummary
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? workspaceId = null,
    Object? latestSessionId = freezed,
    Object? hasPendingApproval = null,
    Object? filesChanged = freezed,
    Object? linesAdded = freezed,
    Object? linesRemoved = freezed,
    Object? latestProcessCompletedAt = freezed,
    Object? latestProcessStatus = freezed,
    Object? hasRunningDevServer = null,
    Object? hasUnseenTurns = null,
    Object? prStatus = freezed,
  }) {
    return _then(
      _value.copyWith(
            workspaceId:
                null == workspaceId
                    ? _value.workspaceId
                    : workspaceId // ignore: cast_nullable_to_non_nullable
                        as String,
            latestSessionId:
                freezed == latestSessionId
                    ? _value.latestSessionId
                    : latestSessionId // ignore: cast_nullable_to_non_nullable
                        as String?,
            hasPendingApproval:
                null == hasPendingApproval
                    ? _value.hasPendingApproval
                    : hasPendingApproval // ignore: cast_nullable_to_non_nullable
                        as bool,
            filesChanged:
                freezed == filesChanged
                    ? _value.filesChanged
                    : filesChanged // ignore: cast_nullable_to_non_nullable
                        as int?,
            linesAdded:
                freezed == linesAdded
                    ? _value.linesAdded
                    : linesAdded // ignore: cast_nullable_to_non_nullable
                        as int?,
            linesRemoved:
                freezed == linesRemoved
                    ? _value.linesRemoved
                    : linesRemoved // ignore: cast_nullable_to_non_nullable
                        as int?,
            latestProcessCompletedAt:
                freezed == latestProcessCompletedAt
                    ? _value.latestProcessCompletedAt
                    : latestProcessCompletedAt // ignore: cast_nullable_to_non_nullable
                        as String?,
            latestProcessStatus:
                freezed == latestProcessStatus
                    ? _value.latestProcessStatus
                    : latestProcessStatus // ignore: cast_nullable_to_non_nullable
                        as ExecutionProcessStatus?,
            hasRunningDevServer:
                null == hasRunningDevServer
                    ? _value.hasRunningDevServer
                    : hasRunningDevServer // ignore: cast_nullable_to_non_nullable
                        as bool,
            hasUnseenTurns:
                null == hasUnseenTurns
                    ? _value.hasUnseenTurns
                    : hasUnseenTurns // ignore: cast_nullable_to_non_nullable
                        as bool,
            prStatus:
                freezed == prStatus
                    ? _value.prStatus
                    : prStatus // ignore: cast_nullable_to_non_nullable
                        as MergeStatus?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$WorkspaceSummaryImplCopyWith<$Res>
    implements $WorkspaceSummaryCopyWith<$Res> {
  factory _$$WorkspaceSummaryImplCopyWith(
    _$WorkspaceSummaryImpl value,
    $Res Function(_$WorkspaceSummaryImpl) then,
  ) = __$$WorkspaceSummaryImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'workspace_id') String workspaceId,
    @JsonKey(name: 'latest_session_id') String? latestSessionId,
    @JsonKey(name: 'has_pending_approval') bool hasPendingApproval,
    @JsonKey(name: 'files_changed') int? filesChanged,
    @JsonKey(name: 'lines_added') int? linesAdded,
    @JsonKey(name: 'lines_removed') int? linesRemoved,
    @JsonKey(name: 'latest_process_completed_at')
    String? latestProcessCompletedAt,
    @JsonKey(name: 'latest_process_status')
    ExecutionProcessStatus? latestProcessStatus,
    @JsonKey(name: 'has_running_dev_server') bool hasRunningDevServer,
    @JsonKey(name: 'has_unseen_turns') bool hasUnseenTurns,
    @JsonKey(name: 'pr_status') MergeStatus? prStatus,
  });
}

/// @nodoc
class __$$WorkspaceSummaryImplCopyWithImpl<$Res>
    extends _$WorkspaceSummaryCopyWithImpl<$Res, _$WorkspaceSummaryImpl>
    implements _$$WorkspaceSummaryImplCopyWith<$Res> {
  __$$WorkspaceSummaryImplCopyWithImpl(
    _$WorkspaceSummaryImpl _value,
    $Res Function(_$WorkspaceSummaryImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of WorkspaceSummary
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? workspaceId = null,
    Object? latestSessionId = freezed,
    Object? hasPendingApproval = null,
    Object? filesChanged = freezed,
    Object? linesAdded = freezed,
    Object? linesRemoved = freezed,
    Object? latestProcessCompletedAt = freezed,
    Object? latestProcessStatus = freezed,
    Object? hasRunningDevServer = null,
    Object? hasUnseenTurns = null,
    Object? prStatus = freezed,
  }) {
    return _then(
      _$WorkspaceSummaryImpl(
        workspaceId:
            null == workspaceId
                ? _value.workspaceId
                : workspaceId // ignore: cast_nullable_to_non_nullable
                    as String,
        latestSessionId:
            freezed == latestSessionId
                ? _value.latestSessionId
                : latestSessionId // ignore: cast_nullable_to_non_nullable
                    as String?,
        hasPendingApproval:
            null == hasPendingApproval
                ? _value.hasPendingApproval
                : hasPendingApproval // ignore: cast_nullable_to_non_nullable
                    as bool,
        filesChanged:
            freezed == filesChanged
                ? _value.filesChanged
                : filesChanged // ignore: cast_nullable_to_non_nullable
                    as int?,
        linesAdded:
            freezed == linesAdded
                ? _value.linesAdded
                : linesAdded // ignore: cast_nullable_to_non_nullable
                    as int?,
        linesRemoved:
            freezed == linesRemoved
                ? _value.linesRemoved
                : linesRemoved // ignore: cast_nullable_to_non_nullable
                    as int?,
        latestProcessCompletedAt:
            freezed == latestProcessCompletedAt
                ? _value.latestProcessCompletedAt
                : latestProcessCompletedAt // ignore: cast_nullable_to_non_nullable
                    as String?,
        latestProcessStatus:
            freezed == latestProcessStatus
                ? _value.latestProcessStatus
                : latestProcessStatus // ignore: cast_nullable_to_non_nullable
                    as ExecutionProcessStatus?,
        hasRunningDevServer:
            null == hasRunningDevServer
                ? _value.hasRunningDevServer
                : hasRunningDevServer // ignore: cast_nullable_to_non_nullable
                    as bool,
        hasUnseenTurns:
            null == hasUnseenTurns
                ? _value.hasUnseenTurns
                : hasUnseenTurns // ignore: cast_nullable_to_non_nullable
                    as bool,
        prStatus:
            freezed == prStatus
                ? _value.prStatus
                : prStatus // ignore: cast_nullable_to_non_nullable
                    as MergeStatus?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$WorkspaceSummaryImpl implements _WorkspaceSummary {
  const _$WorkspaceSummaryImpl({
    @JsonKey(name: 'workspace_id') required this.workspaceId,
    @JsonKey(name: 'latest_session_id') this.latestSessionId,
    @JsonKey(name: 'has_pending_approval') required this.hasPendingApproval,
    @JsonKey(name: 'files_changed') this.filesChanged,
    @JsonKey(name: 'lines_added') this.linesAdded,
    @JsonKey(name: 'lines_removed') this.linesRemoved,
    @JsonKey(name: 'latest_process_completed_at') this.latestProcessCompletedAt,
    @JsonKey(name: 'latest_process_status') this.latestProcessStatus,
    @JsonKey(name: 'has_running_dev_server') required this.hasRunningDevServer,
    @JsonKey(name: 'has_unseen_turns') required this.hasUnseenTurns,
    @JsonKey(name: 'pr_status') this.prStatus,
  });

  factory _$WorkspaceSummaryImpl.fromJson(Map<String, dynamic> json) =>
      _$$WorkspaceSummaryImplFromJson(json);

  @override
  @JsonKey(name: 'workspace_id')
  final String workspaceId;
  @override
  @JsonKey(name: 'latest_session_id')
  final String? latestSessionId;
  @override
  @JsonKey(name: 'has_pending_approval')
  final bool hasPendingApproval;
  @override
  @JsonKey(name: 'files_changed')
  final int? filesChanged;
  @override
  @JsonKey(name: 'lines_added')
  final int? linesAdded;
  @override
  @JsonKey(name: 'lines_removed')
  final int? linesRemoved;
  @override
  @JsonKey(name: 'latest_process_completed_at')
  final String? latestProcessCompletedAt;
  @override
  @JsonKey(name: 'latest_process_status')
  final ExecutionProcessStatus? latestProcessStatus;
  @override
  @JsonKey(name: 'has_running_dev_server')
  final bool hasRunningDevServer;
  @override
  @JsonKey(name: 'has_unseen_turns')
  final bool hasUnseenTurns;
  @override
  @JsonKey(name: 'pr_status')
  final MergeStatus? prStatus;

  @override
  String toString() {
    return 'WorkspaceSummary(workspaceId: $workspaceId, latestSessionId: $latestSessionId, hasPendingApproval: $hasPendingApproval, filesChanged: $filesChanged, linesAdded: $linesAdded, linesRemoved: $linesRemoved, latestProcessCompletedAt: $latestProcessCompletedAt, latestProcessStatus: $latestProcessStatus, hasRunningDevServer: $hasRunningDevServer, hasUnseenTurns: $hasUnseenTurns, prStatus: $prStatus)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$WorkspaceSummaryImpl &&
            (identical(other.workspaceId, workspaceId) ||
                other.workspaceId == workspaceId) &&
            (identical(other.latestSessionId, latestSessionId) ||
                other.latestSessionId == latestSessionId) &&
            (identical(other.hasPendingApproval, hasPendingApproval) ||
                other.hasPendingApproval == hasPendingApproval) &&
            (identical(other.filesChanged, filesChanged) ||
                other.filesChanged == filesChanged) &&
            (identical(other.linesAdded, linesAdded) ||
                other.linesAdded == linesAdded) &&
            (identical(other.linesRemoved, linesRemoved) ||
                other.linesRemoved == linesRemoved) &&
            (identical(
                  other.latestProcessCompletedAt,
                  latestProcessCompletedAt,
                ) ||
                other.latestProcessCompletedAt == latestProcessCompletedAt) &&
            (identical(other.latestProcessStatus, latestProcessStatus) ||
                other.latestProcessStatus == latestProcessStatus) &&
            (identical(other.hasRunningDevServer, hasRunningDevServer) ||
                other.hasRunningDevServer == hasRunningDevServer) &&
            (identical(other.hasUnseenTurns, hasUnseenTurns) ||
                other.hasUnseenTurns == hasUnseenTurns) &&
            (identical(other.prStatus, prStatus) ||
                other.prStatus == prStatus));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    workspaceId,
    latestSessionId,
    hasPendingApproval,
    filesChanged,
    linesAdded,
    linesRemoved,
    latestProcessCompletedAt,
    latestProcessStatus,
    hasRunningDevServer,
    hasUnseenTurns,
    prStatus,
  );

  /// Create a copy of WorkspaceSummary
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$WorkspaceSummaryImplCopyWith<_$WorkspaceSummaryImpl> get copyWith =>
      __$$WorkspaceSummaryImplCopyWithImpl<_$WorkspaceSummaryImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$WorkspaceSummaryImplToJson(this);
  }
}

abstract class _WorkspaceSummary implements WorkspaceSummary {
  const factory _WorkspaceSummary({
    @JsonKey(name: 'workspace_id') required final String workspaceId,
    @JsonKey(name: 'latest_session_id') final String? latestSessionId,
    @JsonKey(name: 'has_pending_approval')
    required final bool hasPendingApproval,
    @JsonKey(name: 'files_changed') final int? filesChanged,
    @JsonKey(name: 'lines_added') final int? linesAdded,
    @JsonKey(name: 'lines_removed') final int? linesRemoved,
    @JsonKey(name: 'latest_process_completed_at')
    final String? latestProcessCompletedAt,
    @JsonKey(name: 'latest_process_status')
    final ExecutionProcessStatus? latestProcessStatus,
    @JsonKey(name: 'has_running_dev_server')
    required final bool hasRunningDevServer,
    @JsonKey(name: 'has_unseen_turns') required final bool hasUnseenTurns,
    @JsonKey(name: 'pr_status') final MergeStatus? prStatus,
  }) = _$WorkspaceSummaryImpl;

  factory _WorkspaceSummary.fromJson(Map<String, dynamic> json) =
      _$WorkspaceSummaryImpl.fromJson;

  @override
  @JsonKey(name: 'workspace_id')
  String get workspaceId;
  @override
  @JsonKey(name: 'latest_session_id')
  String? get latestSessionId;
  @override
  @JsonKey(name: 'has_pending_approval')
  bool get hasPendingApproval;
  @override
  @JsonKey(name: 'files_changed')
  int? get filesChanged;
  @override
  @JsonKey(name: 'lines_added')
  int? get linesAdded;
  @override
  @JsonKey(name: 'lines_removed')
  int? get linesRemoved;
  @override
  @JsonKey(name: 'latest_process_completed_at')
  String? get latestProcessCompletedAt;
  @override
  @JsonKey(name: 'latest_process_status')
  ExecutionProcessStatus? get latestProcessStatus;
  @override
  @JsonKey(name: 'has_running_dev_server')
  bool get hasRunningDevServer;
  @override
  @JsonKey(name: 'has_unseen_turns')
  bool get hasUnseenTurns;
  @override
  @JsonKey(name: 'pr_status')
  MergeStatus? get prStatus;

  /// Create a copy of WorkspaceSummary
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$WorkspaceSummaryImplCopyWith<_$WorkspaceSummaryImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

UpdateWorkspace _$UpdateWorkspaceFromJson(Map<String, dynamic> json) {
  return _UpdateWorkspace.fromJson(json);
}

/// @nodoc
mixin _$UpdateWorkspace {
  bool? get archived => throw _privateConstructorUsedError;
  bool? get pinned => throw _privateConstructorUsedError;
  String? get name => throw _privateConstructorUsedError;

  /// Serializes this UpdateWorkspace to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of UpdateWorkspace
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $UpdateWorkspaceCopyWith<UpdateWorkspace> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UpdateWorkspaceCopyWith<$Res> {
  factory $UpdateWorkspaceCopyWith(
    UpdateWorkspace value,
    $Res Function(UpdateWorkspace) then,
  ) = _$UpdateWorkspaceCopyWithImpl<$Res, UpdateWorkspace>;
  @useResult
  $Res call({bool? archived, bool? pinned, String? name});
}

/// @nodoc
class _$UpdateWorkspaceCopyWithImpl<$Res, $Val extends UpdateWorkspace>
    implements $UpdateWorkspaceCopyWith<$Res> {
  _$UpdateWorkspaceCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of UpdateWorkspace
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? archived = freezed,
    Object? pinned = freezed,
    Object? name = freezed,
  }) {
    return _then(
      _value.copyWith(
            archived:
                freezed == archived
                    ? _value.archived
                    : archived // ignore: cast_nullable_to_non_nullable
                        as bool?,
            pinned:
                freezed == pinned
                    ? _value.pinned
                    : pinned // ignore: cast_nullable_to_non_nullable
                        as bool?,
            name:
                freezed == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$UpdateWorkspaceImplCopyWith<$Res>
    implements $UpdateWorkspaceCopyWith<$Res> {
  factory _$$UpdateWorkspaceImplCopyWith(
    _$UpdateWorkspaceImpl value,
    $Res Function(_$UpdateWorkspaceImpl) then,
  ) = __$$UpdateWorkspaceImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({bool? archived, bool? pinned, String? name});
}

/// @nodoc
class __$$UpdateWorkspaceImplCopyWithImpl<$Res>
    extends _$UpdateWorkspaceCopyWithImpl<$Res, _$UpdateWorkspaceImpl>
    implements _$$UpdateWorkspaceImplCopyWith<$Res> {
  __$$UpdateWorkspaceImplCopyWithImpl(
    _$UpdateWorkspaceImpl _value,
    $Res Function(_$UpdateWorkspaceImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of UpdateWorkspace
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? archived = freezed,
    Object? pinned = freezed,
    Object? name = freezed,
  }) {
    return _then(
      _$UpdateWorkspaceImpl(
        archived:
            freezed == archived
                ? _value.archived
                : archived // ignore: cast_nullable_to_non_nullable
                    as bool?,
        pinned:
            freezed == pinned
                ? _value.pinned
                : pinned // ignore: cast_nullable_to_non_nullable
                    as bool?,
        name:
            freezed == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$UpdateWorkspaceImpl implements _UpdateWorkspace {
  const _$UpdateWorkspaceImpl({this.archived, this.pinned, this.name});

  factory _$UpdateWorkspaceImpl.fromJson(Map<String, dynamic> json) =>
      _$$UpdateWorkspaceImplFromJson(json);

  @override
  final bool? archived;
  @override
  final bool? pinned;
  @override
  final String? name;

  @override
  String toString() {
    return 'UpdateWorkspace(archived: $archived, pinned: $pinned, name: $name)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UpdateWorkspaceImpl &&
            (identical(other.archived, archived) ||
                other.archived == archived) &&
            (identical(other.pinned, pinned) || other.pinned == pinned) &&
            (identical(other.name, name) || other.name == name));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, archived, pinned, name);

  /// Create a copy of UpdateWorkspace
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$UpdateWorkspaceImplCopyWith<_$UpdateWorkspaceImpl> get copyWith =>
      __$$UpdateWorkspaceImplCopyWithImpl<_$UpdateWorkspaceImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$UpdateWorkspaceImplToJson(this);
  }
}

abstract class _UpdateWorkspace implements UpdateWorkspace {
  const factory _UpdateWorkspace({
    final bool? archived,
    final bool? pinned,
    final String? name,
  }) = _$UpdateWorkspaceImpl;

  factory _UpdateWorkspace.fromJson(Map<String, dynamic> json) =
      _$UpdateWorkspaceImpl.fromJson;

  @override
  bool? get archived;
  @override
  bool? get pinned;
  @override
  String? get name;

  /// Create a copy of UpdateWorkspace
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$UpdateWorkspaceImplCopyWith<_$UpdateWorkspaceImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
