// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'project.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Project _$ProjectFromJson(Map<String, dynamic> json) {
  return _Project.fromJson(json);
}

/// @nodoc
mixin _$Project {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String? get defaultAgentWorkingDir => throw _privateConstructorUsedError;
  String? get remoteProjectId => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Project to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Project
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ProjectCopyWith<Project> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProjectCopyWith<$Res> {
  factory $ProjectCopyWith(Project value, $Res Function(Project) then) =
      _$ProjectCopyWithImpl<$Res, Project>;
  @useResult
  $Res call({
    String id,
    String name,
    String? defaultAgentWorkingDir,
    String? remoteProjectId,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class _$ProjectCopyWithImpl<$Res, $Val extends Project>
    implements $ProjectCopyWith<$Res> {
  _$ProjectCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Project
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? defaultAgentWorkingDir = freezed,
    Object? remoteProjectId = freezed,
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
            name:
                null == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String,
            defaultAgentWorkingDir:
                freezed == defaultAgentWorkingDir
                    ? _value.defaultAgentWorkingDir
                    : defaultAgentWorkingDir // ignore: cast_nullable_to_non_nullable
                        as String?,
            remoteProjectId:
                freezed == remoteProjectId
                    ? _value.remoteProjectId
                    : remoteProjectId // ignore: cast_nullable_to_non_nullable
                        as String?,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as DateTime,
            updatedAt:
                null == updatedAt
                    ? _value.updatedAt
                    : updatedAt // ignore: cast_nullable_to_non_nullable
                        as DateTime,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$ProjectImplCopyWith<$Res> implements $ProjectCopyWith<$Res> {
  factory _$$ProjectImplCopyWith(
    _$ProjectImpl value,
    $Res Function(_$ProjectImpl) then,
  ) = __$$ProjectImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    String? defaultAgentWorkingDir,
    String? remoteProjectId,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class __$$ProjectImplCopyWithImpl<$Res>
    extends _$ProjectCopyWithImpl<$Res, _$ProjectImpl>
    implements _$$ProjectImplCopyWith<$Res> {
  __$$ProjectImplCopyWithImpl(
    _$ProjectImpl _value,
    $Res Function(_$ProjectImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Project
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? defaultAgentWorkingDir = freezed,
    Object? remoteProjectId = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$ProjectImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        name:
            null == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String,
        defaultAgentWorkingDir:
            freezed == defaultAgentWorkingDir
                ? _value.defaultAgentWorkingDir
                : defaultAgentWorkingDir // ignore: cast_nullable_to_non_nullable
                    as String?,
        remoteProjectId:
            freezed == remoteProjectId
                ? _value.remoteProjectId
                : remoteProjectId // ignore: cast_nullable_to_non_nullable
                    as String?,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as DateTime,
        updatedAt:
            null == updatedAt
                ? _value.updatedAt
                : updatedAt // ignore: cast_nullable_to_non_nullable
                    as DateTime,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$ProjectImpl implements _Project {
  const _$ProjectImpl({
    required this.id,
    required this.name,
    this.defaultAgentWorkingDir,
    this.remoteProjectId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$ProjectImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProjectImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String? defaultAgentWorkingDir;
  @override
  final String? remoteProjectId;
  @override
  final DateTime createdAt;
  @override
  final DateTime updatedAt;

  @override
  String toString() {
    return 'Project(id: $id, name: $name, defaultAgentWorkingDir: $defaultAgentWorkingDir, remoteProjectId: $remoteProjectId, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProjectImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.defaultAgentWorkingDir, defaultAgentWorkingDir) ||
                other.defaultAgentWorkingDir == defaultAgentWorkingDir) &&
            (identical(other.remoteProjectId, remoteProjectId) ||
                other.remoteProjectId == remoteProjectId) &&
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
    name,
    defaultAgentWorkingDir,
    remoteProjectId,
    createdAt,
    updatedAt,
  );

  /// Create a copy of Project
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ProjectImplCopyWith<_$ProjectImpl> get copyWith =>
      __$$ProjectImplCopyWithImpl<_$ProjectImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProjectImplToJson(this);
  }
}

abstract class _Project implements Project {
  const factory _Project({
    required final String id,
    required final String name,
    final String? defaultAgentWorkingDir,
    final String? remoteProjectId,
    required final DateTime createdAt,
    required final DateTime updatedAt,
  }) = _$ProjectImpl;

  factory _Project.fromJson(Map<String, dynamic> json) = _$ProjectImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String? get defaultAgentWorkingDir;
  @override
  String? get remoteProjectId;
  @override
  DateTime get createdAt;
  @override
  DateTime get updatedAt;

  /// Create a copy of Project
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ProjectImplCopyWith<_$ProjectImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

CreateProject _$CreateProjectFromJson(Map<String, dynamic> json) {
  return _CreateProject.fromJson(json);
}

/// @nodoc
mixin _$CreateProject {
  String get name => throw _privateConstructorUsedError;
  List<CreateProjectRepo> get repositories =>
      throw _privateConstructorUsedError;

  /// Serializes this CreateProject to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of CreateProject
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $CreateProjectCopyWith<CreateProject> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CreateProjectCopyWith<$Res> {
  factory $CreateProjectCopyWith(
    CreateProject value,
    $Res Function(CreateProject) then,
  ) = _$CreateProjectCopyWithImpl<$Res, CreateProject>;
  @useResult
  $Res call({String name, List<CreateProjectRepo> repositories});
}

/// @nodoc
class _$CreateProjectCopyWithImpl<$Res, $Val extends CreateProject>
    implements $CreateProjectCopyWith<$Res> {
  _$CreateProjectCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of CreateProject
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? name = null, Object? repositories = null}) {
    return _then(
      _value.copyWith(
            name:
                null == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String,
            repositories:
                null == repositories
                    ? _value.repositories
                    : repositories // ignore: cast_nullable_to_non_nullable
                        as List<CreateProjectRepo>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$CreateProjectImplCopyWith<$Res>
    implements $CreateProjectCopyWith<$Res> {
  factory _$$CreateProjectImplCopyWith(
    _$CreateProjectImpl value,
    $Res Function(_$CreateProjectImpl) then,
  ) = __$$CreateProjectImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String name, List<CreateProjectRepo> repositories});
}

/// @nodoc
class __$$CreateProjectImplCopyWithImpl<$Res>
    extends _$CreateProjectCopyWithImpl<$Res, _$CreateProjectImpl>
    implements _$$CreateProjectImplCopyWith<$Res> {
  __$$CreateProjectImplCopyWithImpl(
    _$CreateProjectImpl _value,
    $Res Function(_$CreateProjectImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of CreateProject
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? name = null, Object? repositories = null}) {
    return _then(
      _$CreateProjectImpl(
        name:
            null == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String,
        repositories:
            null == repositories
                ? _value._repositories
                : repositories // ignore: cast_nullable_to_non_nullable
                    as List<CreateProjectRepo>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$CreateProjectImpl implements _CreateProject {
  const _$CreateProjectImpl({
    required this.name,
    required final List<CreateProjectRepo> repositories,
  }) : _repositories = repositories;

  factory _$CreateProjectImpl.fromJson(Map<String, dynamic> json) =>
      _$$CreateProjectImplFromJson(json);

  @override
  final String name;
  final List<CreateProjectRepo> _repositories;
  @override
  List<CreateProjectRepo> get repositories {
    if (_repositories is EqualUnmodifiableListView) return _repositories;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_repositories);
  }

  @override
  String toString() {
    return 'CreateProject(name: $name, repositories: $repositories)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CreateProjectImpl &&
            (identical(other.name, name) || other.name == name) &&
            const DeepCollectionEquality().equals(
              other._repositories,
              _repositories,
            ));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    name,
    const DeepCollectionEquality().hash(_repositories),
  );

  /// Create a copy of CreateProject
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$CreateProjectImplCopyWith<_$CreateProjectImpl> get copyWith =>
      __$$CreateProjectImplCopyWithImpl<_$CreateProjectImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CreateProjectImplToJson(this);
  }
}

abstract class _CreateProject implements CreateProject {
  const factory _CreateProject({
    required final String name,
    required final List<CreateProjectRepo> repositories,
  }) = _$CreateProjectImpl;

  factory _CreateProject.fromJson(Map<String, dynamic> json) =
      _$CreateProjectImpl.fromJson;

  @override
  String get name;
  @override
  List<CreateProjectRepo> get repositories;

  /// Create a copy of CreateProject
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$CreateProjectImplCopyWith<_$CreateProjectImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

UpdateProject _$UpdateProjectFromJson(Map<String, dynamic> json) {
  return _UpdateProject.fromJson(json);
}

/// @nodoc
mixin _$UpdateProject {
  String? get name => throw _privateConstructorUsedError;

  /// Serializes this UpdateProject to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of UpdateProject
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $UpdateProjectCopyWith<UpdateProject> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UpdateProjectCopyWith<$Res> {
  factory $UpdateProjectCopyWith(
    UpdateProject value,
    $Res Function(UpdateProject) then,
  ) = _$UpdateProjectCopyWithImpl<$Res, UpdateProject>;
  @useResult
  $Res call({String? name});
}

/// @nodoc
class _$UpdateProjectCopyWithImpl<$Res, $Val extends UpdateProject>
    implements $UpdateProjectCopyWith<$Res> {
  _$UpdateProjectCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of UpdateProject
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? name = freezed}) {
    return _then(
      _value.copyWith(
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
abstract class _$$UpdateProjectImplCopyWith<$Res>
    implements $UpdateProjectCopyWith<$Res> {
  factory _$$UpdateProjectImplCopyWith(
    _$UpdateProjectImpl value,
    $Res Function(_$UpdateProjectImpl) then,
  ) = __$$UpdateProjectImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String? name});
}

/// @nodoc
class __$$UpdateProjectImplCopyWithImpl<$Res>
    extends _$UpdateProjectCopyWithImpl<$Res, _$UpdateProjectImpl>
    implements _$$UpdateProjectImplCopyWith<$Res> {
  __$$UpdateProjectImplCopyWithImpl(
    _$UpdateProjectImpl _value,
    $Res Function(_$UpdateProjectImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of UpdateProject
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? name = freezed}) {
    return _then(
      _$UpdateProjectImpl(
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
class _$UpdateProjectImpl implements _UpdateProject {
  const _$UpdateProjectImpl({this.name});

  factory _$UpdateProjectImpl.fromJson(Map<String, dynamic> json) =>
      _$$UpdateProjectImplFromJson(json);

  @override
  final String? name;

  @override
  String toString() {
    return 'UpdateProject(name: $name)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UpdateProjectImpl &&
            (identical(other.name, name) || other.name == name));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, name);

  /// Create a copy of UpdateProject
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$UpdateProjectImplCopyWith<_$UpdateProjectImpl> get copyWith =>
      __$$UpdateProjectImplCopyWithImpl<_$UpdateProjectImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$UpdateProjectImplToJson(this);
  }
}

abstract class _UpdateProject implements UpdateProject {
  const factory _UpdateProject({final String? name}) = _$UpdateProjectImpl;

  factory _UpdateProject.fromJson(Map<String, dynamic> json) =
      _$UpdateProjectImpl.fromJson;

  @override
  String? get name;

  /// Create a copy of UpdateProject
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$UpdateProjectImplCopyWith<_$UpdateProjectImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

CreateProjectRepo _$CreateProjectRepoFromJson(Map<String, dynamic> json) {
  return _CreateProjectRepo.fromJson(json);
}

/// @nodoc
mixin _$CreateProjectRepo {
  String get displayName => throw _privateConstructorUsedError;
  String get gitRepoPath => throw _privateConstructorUsedError;

  /// Serializes this CreateProjectRepo to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of CreateProjectRepo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $CreateProjectRepoCopyWith<CreateProjectRepo> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CreateProjectRepoCopyWith<$Res> {
  factory $CreateProjectRepoCopyWith(
    CreateProjectRepo value,
    $Res Function(CreateProjectRepo) then,
  ) = _$CreateProjectRepoCopyWithImpl<$Res, CreateProjectRepo>;
  @useResult
  $Res call({String displayName, String gitRepoPath});
}

/// @nodoc
class _$CreateProjectRepoCopyWithImpl<$Res, $Val extends CreateProjectRepo>
    implements $CreateProjectRepoCopyWith<$Res> {
  _$CreateProjectRepoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of CreateProjectRepo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? displayName = null, Object? gitRepoPath = null}) {
    return _then(
      _value.copyWith(
            displayName:
                null == displayName
                    ? _value.displayName
                    : displayName // ignore: cast_nullable_to_non_nullable
                        as String,
            gitRepoPath:
                null == gitRepoPath
                    ? _value.gitRepoPath
                    : gitRepoPath // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$CreateProjectRepoImplCopyWith<$Res>
    implements $CreateProjectRepoCopyWith<$Res> {
  factory _$$CreateProjectRepoImplCopyWith(
    _$CreateProjectRepoImpl value,
    $Res Function(_$CreateProjectRepoImpl) then,
  ) = __$$CreateProjectRepoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String displayName, String gitRepoPath});
}

/// @nodoc
class __$$CreateProjectRepoImplCopyWithImpl<$Res>
    extends _$CreateProjectRepoCopyWithImpl<$Res, _$CreateProjectRepoImpl>
    implements _$$CreateProjectRepoImplCopyWith<$Res> {
  __$$CreateProjectRepoImplCopyWithImpl(
    _$CreateProjectRepoImpl _value,
    $Res Function(_$CreateProjectRepoImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of CreateProjectRepo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? displayName = null, Object? gitRepoPath = null}) {
    return _then(
      _$CreateProjectRepoImpl(
        displayName:
            null == displayName
                ? _value.displayName
                : displayName // ignore: cast_nullable_to_non_nullable
                    as String,
        gitRepoPath:
            null == gitRepoPath
                ? _value.gitRepoPath
                : gitRepoPath // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$CreateProjectRepoImpl implements _CreateProjectRepo {
  const _$CreateProjectRepoImpl({
    required this.displayName,
    required this.gitRepoPath,
  });

  factory _$CreateProjectRepoImpl.fromJson(Map<String, dynamic> json) =>
      _$$CreateProjectRepoImplFromJson(json);

  @override
  final String displayName;
  @override
  final String gitRepoPath;

  @override
  String toString() {
    return 'CreateProjectRepo(displayName: $displayName, gitRepoPath: $gitRepoPath)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CreateProjectRepoImpl &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName) &&
            (identical(other.gitRepoPath, gitRepoPath) ||
                other.gitRepoPath == gitRepoPath));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, displayName, gitRepoPath);

  /// Create a copy of CreateProjectRepo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$CreateProjectRepoImplCopyWith<_$CreateProjectRepoImpl> get copyWith =>
      __$$CreateProjectRepoImplCopyWithImpl<_$CreateProjectRepoImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$CreateProjectRepoImplToJson(this);
  }
}

abstract class _CreateProjectRepo implements CreateProjectRepo {
  const factory _CreateProjectRepo({
    required final String displayName,
    required final String gitRepoPath,
  }) = _$CreateProjectRepoImpl;

  factory _CreateProjectRepo.fromJson(Map<String, dynamic> json) =
      _$CreateProjectRepoImpl.fromJson;

  @override
  String get displayName;
  @override
  String get gitRepoPath;

  /// Create a copy of CreateProjectRepo
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$CreateProjectRepoImplCopyWith<_$CreateProjectRepoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
