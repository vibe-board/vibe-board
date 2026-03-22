// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'session.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Session _$SessionFromJson(Map<String, dynamic> json) {
  return _Session.fromJson(json);
}

/// @nodoc
mixin _$Session {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'workspace_id')
  String get workspaceId => throw _privateConstructorUsedError;
  String? get executor => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Session to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Session
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $SessionCopyWith<Session> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SessionCopyWith<$Res> {
  factory $SessionCopyWith(Session value, $Res Function(Session) then) =
      _$SessionCopyWithImpl<$Res, Session>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'workspace_id') String workspaceId,
    String? executor,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$SessionCopyWithImpl<$Res, $Val extends Session>
    implements $SessionCopyWith<$Res> {
  _$SessionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Session
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? workspaceId = null,
    Object? executor = freezed,
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
            workspaceId:
                null == workspaceId
                    ? _value.workspaceId
                    : workspaceId // ignore: cast_nullable_to_non_nullable
                        as String,
            executor:
                freezed == executor
                    ? _value.executor
                    : executor // ignore: cast_nullable_to_non_nullable
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
abstract class _$$SessionImplCopyWith<$Res> implements $SessionCopyWith<$Res> {
  factory _$$SessionImplCopyWith(
    _$SessionImpl value,
    $Res Function(_$SessionImpl) then,
  ) = __$$SessionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'workspace_id') String workspaceId,
    String? executor,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$$SessionImplCopyWithImpl<$Res>
    extends _$SessionCopyWithImpl<$Res, _$SessionImpl>
    implements _$$SessionImplCopyWith<$Res> {
  __$$SessionImplCopyWithImpl(
    _$SessionImpl _value,
    $Res Function(_$SessionImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Session
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? workspaceId = null,
    Object? executor = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$SessionImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        workspaceId:
            null == workspaceId
                ? _value.workspaceId
                : workspaceId // ignore: cast_nullable_to_non_nullable
                    as String,
        executor:
            freezed == executor
                ? _value.executor
                : executor // ignore: cast_nullable_to_non_nullable
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
class _$SessionImpl implements _Session {
  const _$SessionImpl({
    required this.id,
    @JsonKey(name: 'workspace_id') required this.workspaceId,
    this.executor,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$SessionImpl.fromJson(Map<String, dynamic> json) =>
      _$$SessionImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'workspace_id')
  final String workspaceId;
  @override
  final String? executor;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  @override
  String toString() {
    return 'Session(id: $id, workspaceId: $workspaceId, executor: $executor, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SessionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.workspaceId, workspaceId) ||
                other.workspaceId == workspaceId) &&
            (identical(other.executor, executor) ||
                other.executor == executor) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, workspaceId, executor, createdAt, updatedAt);

  /// Create a copy of Session
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$SessionImplCopyWith<_$SessionImpl> get copyWith =>
      __$$SessionImplCopyWithImpl<_$SessionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SessionImplToJson(this);
  }
}

abstract class _Session implements Session {
  const factory _Session({
    required final String id,
    @JsonKey(name: 'workspace_id') required final String workspaceId,
    final String? executor,
    required final String createdAt,
    required final String updatedAt,
  }) = _$SessionImpl;

  factory _Session.fromJson(Map<String, dynamic> json) = _$SessionImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'workspace_id')
  String get workspaceId;
  @override
  String? get executor;
  @override
  String get createdAt;
  @override
  String get updatedAt;

  /// Create a copy of Session
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$SessionImplCopyWith<_$SessionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

ExecutionProcess _$ExecutionProcessFromJson(Map<String, dynamic> json) {
  return _ExecutionProcess.fromJson(json);
}

/// @nodoc
mixin _$ExecutionProcess {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'session_id')
  String get sessionId => throw _privateConstructorUsedError;
  @JsonKey(name: 'run_reason')
  ExecutionProcessRunReason get runReason => throw _privateConstructorUsedError;
  @JsonKey(name: 'executor_action')
  Map<String, dynamic> get executorAction => throw _privateConstructorUsedError;
  ExecutionProcessStatus get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'exit_code')
  BigInt? get exitCode => throw _privateConstructorUsedError;
  bool get dropped => throw _privateConstructorUsedError;
  String get startedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'completed_at')
  String? get completedAt => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this ExecutionProcess to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ExecutionProcess
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ExecutionProcessCopyWith<ExecutionProcess> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ExecutionProcessCopyWith<$Res> {
  factory $ExecutionProcessCopyWith(
    ExecutionProcess value,
    $Res Function(ExecutionProcess) then,
  ) = _$ExecutionProcessCopyWithImpl<$Res, ExecutionProcess>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'session_id') String sessionId,
    @JsonKey(name: 'run_reason') ExecutionProcessRunReason runReason,
    @JsonKey(name: 'executor_action') Map<String, dynamic> executorAction,
    ExecutionProcessStatus status,
    @JsonKey(name: 'exit_code') BigInt? exitCode,
    bool dropped,
    String startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$ExecutionProcessCopyWithImpl<$Res, $Val extends ExecutionProcess>
    implements $ExecutionProcessCopyWith<$Res> {
  _$ExecutionProcessCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ExecutionProcess
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? runReason = null,
    Object? executorAction = null,
    Object? status = null,
    Object? exitCode = freezed,
    Object? dropped = null,
    Object? startedAt = null,
    Object? completedAt = freezed,
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
            sessionId:
                null == sessionId
                    ? _value.sessionId
                    : sessionId // ignore: cast_nullable_to_non_nullable
                        as String,
            runReason:
                null == runReason
                    ? _value.runReason
                    : runReason // ignore: cast_nullable_to_non_nullable
                        as ExecutionProcessRunReason,
            executorAction:
                null == executorAction
                    ? _value.executorAction
                    : executorAction // ignore: cast_nullable_to_non_nullable
                        as Map<String, dynamic>,
            status:
                null == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as ExecutionProcessStatus,
            exitCode:
                freezed == exitCode
                    ? _value.exitCode
                    : exitCode // ignore: cast_nullable_to_non_nullable
                        as BigInt?,
            dropped:
                null == dropped
                    ? _value.dropped
                    : dropped // ignore: cast_nullable_to_non_nullable
                        as bool,
            startedAt:
                null == startedAt
                    ? _value.startedAt
                    : startedAt // ignore: cast_nullable_to_non_nullable
                        as String,
            completedAt:
                freezed == completedAt
                    ? _value.completedAt
                    : completedAt // ignore: cast_nullable_to_non_nullable
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
abstract class _$$ExecutionProcessImplCopyWith<$Res>
    implements $ExecutionProcessCopyWith<$Res> {
  factory _$$ExecutionProcessImplCopyWith(
    _$ExecutionProcessImpl value,
    $Res Function(_$ExecutionProcessImpl) then,
  ) = __$$ExecutionProcessImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'session_id') String sessionId,
    @JsonKey(name: 'run_reason') ExecutionProcessRunReason runReason,
    @JsonKey(name: 'executor_action') Map<String, dynamic> executorAction,
    ExecutionProcessStatus status,
    @JsonKey(name: 'exit_code') BigInt? exitCode,
    bool dropped,
    String startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$$ExecutionProcessImplCopyWithImpl<$Res>
    extends _$ExecutionProcessCopyWithImpl<$Res, _$ExecutionProcessImpl>
    implements _$$ExecutionProcessImplCopyWith<$Res> {
  __$$ExecutionProcessImplCopyWithImpl(
    _$ExecutionProcessImpl _value,
    $Res Function(_$ExecutionProcessImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of ExecutionProcess
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? runReason = null,
    Object? executorAction = null,
    Object? status = null,
    Object? exitCode = freezed,
    Object? dropped = null,
    Object? startedAt = null,
    Object? completedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$ExecutionProcessImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        sessionId:
            null == sessionId
                ? _value.sessionId
                : sessionId // ignore: cast_nullable_to_non_nullable
                    as String,
        runReason:
            null == runReason
                ? _value.runReason
                : runReason // ignore: cast_nullable_to_non_nullable
                    as ExecutionProcessRunReason,
        executorAction:
            null == executorAction
                ? _value._executorAction
                : executorAction // ignore: cast_nullable_to_non_nullable
                    as Map<String, dynamic>,
        status:
            null == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as ExecutionProcessStatus,
        exitCode:
            freezed == exitCode
                ? _value.exitCode
                : exitCode // ignore: cast_nullable_to_non_nullable
                    as BigInt?,
        dropped:
            null == dropped
                ? _value.dropped
                : dropped // ignore: cast_nullable_to_non_nullable
                    as bool,
        startedAt:
            null == startedAt
                ? _value.startedAt
                : startedAt // ignore: cast_nullable_to_non_nullable
                    as String,
        completedAt:
            freezed == completedAt
                ? _value.completedAt
                : completedAt // ignore: cast_nullable_to_non_nullable
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
class _$ExecutionProcessImpl implements _ExecutionProcess {
  const _$ExecutionProcessImpl({
    required this.id,
    @JsonKey(name: 'session_id') required this.sessionId,
    @JsonKey(name: 'run_reason') required this.runReason,
    @JsonKey(name: 'executor_action')
    required final Map<String, dynamic> executorAction,
    required this.status,
    @JsonKey(name: 'exit_code') this.exitCode,
    required this.dropped,
    required this.startedAt,
    @JsonKey(name: 'completed_at') this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  }) : _executorAction = executorAction;

  factory _$ExecutionProcessImpl.fromJson(Map<String, dynamic> json) =>
      _$$ExecutionProcessImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'session_id')
  final String sessionId;
  @override
  @JsonKey(name: 'run_reason')
  final ExecutionProcessRunReason runReason;
  final Map<String, dynamic> _executorAction;
  @override
  @JsonKey(name: 'executor_action')
  Map<String, dynamic> get executorAction {
    if (_executorAction is EqualUnmodifiableMapView) return _executorAction;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_executorAction);
  }

  @override
  final ExecutionProcessStatus status;
  @override
  @JsonKey(name: 'exit_code')
  final BigInt? exitCode;
  @override
  final bool dropped;
  @override
  final String startedAt;
  @override
  @JsonKey(name: 'completed_at')
  final String? completedAt;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  @override
  String toString() {
    return 'ExecutionProcess(id: $id, sessionId: $sessionId, runReason: $runReason, executorAction: $executorAction, status: $status, exitCode: $exitCode, dropped: $dropped, startedAt: $startedAt, completedAt: $completedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ExecutionProcessImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.runReason, runReason) ||
                other.runReason == runReason) &&
            const DeepCollectionEquality().equals(
              other._executorAction,
              _executorAction,
            ) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.exitCode, exitCode) ||
                other.exitCode == exitCode) &&
            (identical(other.dropped, dropped) || other.dropped == dropped) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
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
    sessionId,
    runReason,
    const DeepCollectionEquality().hash(_executorAction),
    status,
    exitCode,
    dropped,
    startedAt,
    completedAt,
    createdAt,
    updatedAt,
  );

  /// Create a copy of ExecutionProcess
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ExecutionProcessImplCopyWith<_$ExecutionProcessImpl> get copyWith =>
      __$$ExecutionProcessImplCopyWithImpl<_$ExecutionProcessImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$ExecutionProcessImplToJson(this);
  }
}

abstract class _ExecutionProcess implements ExecutionProcess {
  const factory _ExecutionProcess({
    required final String id,
    @JsonKey(name: 'session_id') required final String sessionId,
    @JsonKey(name: 'run_reason')
    required final ExecutionProcessRunReason runReason,
    @JsonKey(name: 'executor_action')
    required final Map<String, dynamic> executorAction,
    required final ExecutionProcessStatus status,
    @JsonKey(name: 'exit_code') final BigInt? exitCode,
    required final bool dropped,
    required final String startedAt,
    @JsonKey(name: 'completed_at') final String? completedAt,
    required final String createdAt,
    required final String updatedAt,
  }) = _$ExecutionProcessImpl;

  factory _ExecutionProcess.fromJson(Map<String, dynamic> json) =
      _$ExecutionProcessImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'session_id')
  String get sessionId;
  @override
  @JsonKey(name: 'run_reason')
  ExecutionProcessRunReason get runReason;
  @override
  @JsonKey(name: 'executor_action')
  Map<String, dynamic> get executorAction;
  @override
  ExecutionProcessStatus get status;
  @override
  @JsonKey(name: 'exit_code')
  BigInt? get exitCode;
  @override
  bool get dropped;
  @override
  String get startedAt;
  @override
  @JsonKey(name: 'completed_at')
  String? get completedAt;
  @override
  String get createdAt;
  @override
  String get updatedAt;

  /// Create a copy of ExecutionProcess
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ExecutionProcessImplCopyWith<_$ExecutionProcessImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

ExecutorProfileId _$ExecutorProfileIdFromJson(Map<String, dynamic> json) {
  return _ExecutorProfileId.fromJson(json);
}

/// @nodoc
mixin _$ExecutorProfileId {
  String get executor => throw _privateConstructorUsedError;
  String? get variant => throw _privateConstructorUsedError;

  /// Serializes this ExecutorProfileId to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ExecutorProfileId
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ExecutorProfileIdCopyWith<ExecutorProfileId> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ExecutorProfileIdCopyWith<$Res> {
  factory $ExecutorProfileIdCopyWith(
    ExecutorProfileId value,
    $Res Function(ExecutorProfileId) then,
  ) = _$ExecutorProfileIdCopyWithImpl<$Res, ExecutorProfileId>;
  @useResult
  $Res call({String executor, String? variant});
}

/// @nodoc
class _$ExecutorProfileIdCopyWithImpl<$Res, $Val extends ExecutorProfileId>
    implements $ExecutorProfileIdCopyWith<$Res> {
  _$ExecutorProfileIdCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ExecutorProfileId
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? executor = null, Object? variant = freezed}) {
    return _then(
      _value.copyWith(
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
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$ExecutorProfileIdImplCopyWith<$Res>
    implements $ExecutorProfileIdCopyWith<$Res> {
  factory _$$ExecutorProfileIdImplCopyWith(
    _$ExecutorProfileIdImpl value,
    $Res Function(_$ExecutorProfileIdImpl) then,
  ) = __$$ExecutorProfileIdImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String executor, String? variant});
}

/// @nodoc
class __$$ExecutorProfileIdImplCopyWithImpl<$Res>
    extends _$ExecutorProfileIdCopyWithImpl<$Res, _$ExecutorProfileIdImpl>
    implements _$$ExecutorProfileIdImplCopyWith<$Res> {
  __$$ExecutorProfileIdImplCopyWithImpl(
    _$ExecutorProfileIdImpl _value,
    $Res Function(_$ExecutorProfileIdImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of ExecutorProfileId
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? executor = null, Object? variant = freezed}) {
    return _then(
      _$ExecutorProfileIdImpl(
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
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$ExecutorProfileIdImpl implements _ExecutorProfileId {
  const _$ExecutorProfileIdImpl({required this.executor, this.variant});

  factory _$ExecutorProfileIdImpl.fromJson(Map<String, dynamic> json) =>
      _$$ExecutorProfileIdImplFromJson(json);

  @override
  final String executor;
  @override
  final String? variant;

  @override
  String toString() {
    return 'ExecutorProfileId(executor: $executor, variant: $variant)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ExecutorProfileIdImpl &&
            (identical(other.executor, executor) ||
                other.executor == executor) &&
            (identical(other.variant, variant) || other.variant == variant));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, executor, variant);

  /// Create a copy of ExecutorProfileId
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ExecutorProfileIdImplCopyWith<_$ExecutorProfileIdImpl> get copyWith =>
      __$$ExecutorProfileIdImplCopyWithImpl<_$ExecutorProfileIdImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$ExecutorProfileIdImplToJson(this);
  }
}

abstract class _ExecutorProfileId implements ExecutorProfileId {
  const factory _ExecutorProfileId({
    required final String executor,
    final String? variant,
  }) = _$ExecutorProfileIdImpl;

  factory _ExecutorProfileId.fromJson(Map<String, dynamic> json) =
      _$ExecutorProfileIdImpl.fromJson;

  @override
  String get executor;
  @override
  String? get variant;

  /// Create a copy of ExecutorProfileId
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ExecutorProfileIdImplCopyWith<_$ExecutorProfileIdImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
