// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'repo.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Repo _$RepoFromJson(Map<String, dynamic> json) {
  return _Repo.fromJson(json);
}

/// @nodoc
mixin _$Repo {
  String get id => throw _privateConstructorUsedError;
  String get path => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  @JsonKey(name: 'display_name')
  String get displayName => throw _privateConstructorUsedError;
  @JsonKey(name: 'setup_script')
  String? get setupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'archive_script')
  String? get archiveScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'copy_files')
  String? get copyFiles => throw _privateConstructorUsedError;
  @JsonKey(name: 'parallel_setup_script')
  bool get parallelSetupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Repo to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Repo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $RepoCopyWith<Repo> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RepoCopyWith<$Res> {
  factory $RepoCopyWith(Repo value, $Res Function(Repo) then) =
      _$RepoCopyWithImpl<$Res, Repo>;
  @useResult
  $Res call({
    String id,
    String path,
    String name,
    @JsonKey(name: 'display_name') String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class _$RepoCopyWithImpl<$Res, $Val extends Repo>
    implements $RepoCopyWith<$Res> {
  _$RepoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Repo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? path = null,
    Object? name = null,
    Object? displayName = null,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = null,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
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
            path:
                null == path
                    ? _value.path
                    : path // ignore: cast_nullable_to_non_nullable
                        as String,
            name:
                null == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String,
            displayName:
                null == displayName
                    ? _value.displayName
                    : displayName // ignore: cast_nullable_to_non_nullable
                        as String,
            setupScript:
                freezed == setupScript
                    ? _value.setupScript
                    : setupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            cleanupScript:
                freezed == cleanupScript
                    ? _value.cleanupScript
                    : cleanupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            archiveScript:
                freezed == archiveScript
                    ? _value.archiveScript
                    : archiveScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            copyFiles:
                freezed == copyFiles
                    ? _value.copyFiles
                    : copyFiles // ignore: cast_nullable_to_non_nullable
                        as String?,
            parallelSetupScript:
                null == parallelSetupScript
                    ? _value.parallelSetupScript
                    : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                        as bool,
            devServerScript:
                freezed == devServerScript
                    ? _value.devServerScript
                    : devServerScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultTargetBranch:
                freezed == defaultTargetBranch
                    ? _value.defaultTargetBranch
                    : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultWorkingDir:
                freezed == defaultWorkingDir
                    ? _value.defaultWorkingDir
                    : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
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
abstract class _$$RepoImplCopyWith<$Res> implements $RepoCopyWith<$Res> {
  factory _$$RepoImplCopyWith(
    _$RepoImpl value,
    $Res Function(_$RepoImpl) then,
  ) = __$$RepoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String path,
    String name,
    @JsonKey(name: 'display_name') String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class __$$RepoImplCopyWithImpl<$Res>
    extends _$RepoCopyWithImpl<$Res, _$RepoImpl>
    implements _$$RepoImplCopyWith<$Res> {
  __$$RepoImplCopyWithImpl(_$RepoImpl _value, $Res Function(_$RepoImpl) _then)
    : super(_value, _then);

  /// Create a copy of Repo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? path = null,
    Object? name = null,
    Object? displayName = null,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = null,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$RepoImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        path:
            null == path
                ? _value.path
                : path // ignore: cast_nullable_to_non_nullable
                    as String,
        name:
            null == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String,
        displayName:
            null == displayName
                ? _value.displayName
                : displayName // ignore: cast_nullable_to_non_nullable
                    as String,
        setupScript:
            freezed == setupScript
                ? _value.setupScript
                : setupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        cleanupScript:
            freezed == cleanupScript
                ? _value.cleanupScript
                : cleanupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        archiveScript:
            freezed == archiveScript
                ? _value.archiveScript
                : archiveScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        copyFiles:
            freezed == copyFiles
                ? _value.copyFiles
                : copyFiles // ignore: cast_nullable_to_non_nullable
                    as String?,
        parallelSetupScript:
            null == parallelSetupScript
                ? _value.parallelSetupScript
                : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                    as bool,
        devServerScript:
            freezed == devServerScript
                ? _value.devServerScript
                : devServerScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultTargetBranch:
            freezed == defaultTargetBranch
                ? _value.defaultTargetBranch
                : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultWorkingDir:
            freezed == defaultWorkingDir
                ? _value.defaultWorkingDir
                : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
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
class _$RepoImpl implements _Repo {
  const _$RepoImpl({
    required this.id,
    required this.path,
    required this.name,
    @JsonKey(name: 'display_name') required this.displayName,
    @JsonKey(name: 'setup_script') this.setupScript,
    @JsonKey(name: 'cleanup_script') this.cleanupScript,
    @JsonKey(name: 'archive_script') this.archiveScript,
    @JsonKey(name: 'copy_files') this.copyFiles,
    @JsonKey(name: 'parallel_setup_script') required this.parallelSetupScript,
    @JsonKey(name: 'dev_server_script') this.devServerScript,
    @JsonKey(name: 'default_target_branch') this.defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') this.defaultWorkingDir,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$RepoImpl.fromJson(Map<String, dynamic> json) =>
      _$$RepoImplFromJson(json);

  @override
  final String id;
  @override
  final String path;
  @override
  final String name;
  @override
  @JsonKey(name: 'display_name')
  final String displayName;
  @override
  @JsonKey(name: 'setup_script')
  final String? setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  final String? cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  final String? archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  final String? copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  final bool parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  final String? devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  final String? defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  final String? defaultWorkingDir;
  @override
  final DateTime createdAt;
  @override
  final DateTime updatedAt;

  @override
  String toString() {
    return 'Repo(id: $id, path: $path, name: $name, displayName: $displayName, setupScript: $setupScript, cleanupScript: $cleanupScript, archiveScript: $archiveScript, copyFiles: $copyFiles, parallelSetupScript: $parallelSetupScript, devServerScript: $devServerScript, defaultTargetBranch: $defaultTargetBranch, defaultWorkingDir: $defaultWorkingDir, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RepoImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.path, path) || other.path == path) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName) &&
            (identical(other.setupScript, setupScript) ||
                other.setupScript == setupScript) &&
            (identical(other.cleanupScript, cleanupScript) ||
                other.cleanupScript == cleanupScript) &&
            (identical(other.archiveScript, archiveScript) ||
                other.archiveScript == archiveScript) &&
            (identical(other.copyFiles, copyFiles) ||
                other.copyFiles == copyFiles) &&
            (identical(other.parallelSetupScript, parallelSetupScript) ||
                other.parallelSetupScript == parallelSetupScript) &&
            (identical(other.devServerScript, devServerScript) ||
                other.devServerScript == devServerScript) &&
            (identical(other.defaultTargetBranch, defaultTargetBranch) ||
                other.defaultTargetBranch == defaultTargetBranch) &&
            (identical(other.defaultWorkingDir, defaultWorkingDir) ||
                other.defaultWorkingDir == defaultWorkingDir) &&
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
    path,
    name,
    displayName,
    setupScript,
    cleanupScript,
    archiveScript,
    copyFiles,
    parallelSetupScript,
    devServerScript,
    defaultTargetBranch,
    defaultWorkingDir,
    createdAt,
    updatedAt,
  );

  /// Create a copy of Repo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$RepoImplCopyWith<_$RepoImpl> get copyWith =>
      __$$RepoImplCopyWithImpl<_$RepoImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RepoImplToJson(this);
  }
}

abstract class _Repo implements Repo {
  const factory _Repo({
    required final String id,
    required final String path,
    required final String name,
    @JsonKey(name: 'display_name') required final String displayName,
    @JsonKey(name: 'setup_script') final String? setupScript,
    @JsonKey(name: 'cleanup_script') final String? cleanupScript,
    @JsonKey(name: 'archive_script') final String? archiveScript,
    @JsonKey(name: 'copy_files') final String? copyFiles,
    @JsonKey(name: 'parallel_setup_script')
    required final bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') final String? devServerScript,
    @JsonKey(name: 'default_target_branch') final String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') final String? defaultWorkingDir,
    required final DateTime createdAt,
    required final DateTime updatedAt,
  }) = _$RepoImpl;

  factory _Repo.fromJson(Map<String, dynamic> json) = _$RepoImpl.fromJson;

  @override
  String get id;
  @override
  String get path;
  @override
  String get name;
  @override
  @JsonKey(name: 'display_name')
  String get displayName;
  @override
  @JsonKey(name: 'setup_script')
  String? get setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  String? get archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  String? get copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  bool get parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir;
  @override
  DateTime get createdAt;
  @override
  DateTime get updatedAt;

  /// Create a copy of Repo
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$RepoImplCopyWith<_$RepoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

RepoWithTargetBranch _$RepoWithTargetBranchFromJson(Map<String, dynamic> json) {
  return _RepoWithTargetBranch.fromJson(json);
}

/// @nodoc
mixin _$RepoWithTargetBranch {
  @JsonKey(name: 'target_branch')
  String get targetBranch => throw _privateConstructorUsedError;
  String get id => throw _privateConstructorUsedError;
  String get path => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  @JsonKey(name: 'display_name')
  String get displayName => throw _privateConstructorUsedError;
  @JsonKey(name: 'setup_script')
  String? get setupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'archive_script')
  String? get archiveScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'copy_files')
  String? get copyFiles => throw _privateConstructorUsedError;
  @JsonKey(name: 'parallel_setup_script')
  bool get parallelSetupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this RepoWithTargetBranch to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of RepoWithTargetBranch
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $RepoWithTargetBranchCopyWith<RepoWithTargetBranch> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RepoWithTargetBranchCopyWith<$Res> {
  factory $RepoWithTargetBranchCopyWith(
    RepoWithTargetBranch value,
    $Res Function(RepoWithTargetBranch) then,
  ) = _$RepoWithTargetBranchCopyWithImpl<$Res, RepoWithTargetBranch>;
  @useResult
  $Res call({
    @JsonKey(name: 'target_branch') String targetBranch,
    String id,
    String path,
    String name,
    @JsonKey(name: 'display_name') String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class _$RepoWithTargetBranchCopyWithImpl<
  $Res,
  $Val extends RepoWithTargetBranch
>
    implements $RepoWithTargetBranchCopyWith<$Res> {
  _$RepoWithTargetBranchCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of RepoWithTargetBranch
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? targetBranch = null,
    Object? id = null,
    Object? path = null,
    Object? name = null,
    Object? displayName = null,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = null,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _value.copyWith(
            targetBranch:
                null == targetBranch
                    ? _value.targetBranch
                    : targetBranch // ignore: cast_nullable_to_non_nullable
                        as String,
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            path:
                null == path
                    ? _value.path
                    : path // ignore: cast_nullable_to_non_nullable
                        as String,
            name:
                null == name
                    ? _value.name
                    : name // ignore: cast_nullable_to_non_nullable
                        as String,
            displayName:
                null == displayName
                    ? _value.displayName
                    : displayName // ignore: cast_nullable_to_non_nullable
                        as String,
            setupScript:
                freezed == setupScript
                    ? _value.setupScript
                    : setupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            cleanupScript:
                freezed == cleanupScript
                    ? _value.cleanupScript
                    : cleanupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            archiveScript:
                freezed == archiveScript
                    ? _value.archiveScript
                    : archiveScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            copyFiles:
                freezed == copyFiles
                    ? _value.copyFiles
                    : copyFiles // ignore: cast_nullable_to_non_nullable
                        as String?,
            parallelSetupScript:
                null == parallelSetupScript
                    ? _value.parallelSetupScript
                    : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                        as bool,
            devServerScript:
                freezed == devServerScript
                    ? _value.devServerScript
                    : devServerScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultTargetBranch:
                freezed == defaultTargetBranch
                    ? _value.defaultTargetBranch
                    : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultWorkingDir:
                freezed == defaultWorkingDir
                    ? _value.defaultWorkingDir
                    : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
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
abstract class _$$RepoWithTargetBranchImplCopyWith<$Res>
    implements $RepoWithTargetBranchCopyWith<$Res> {
  factory _$$RepoWithTargetBranchImplCopyWith(
    _$RepoWithTargetBranchImpl value,
    $Res Function(_$RepoWithTargetBranchImpl) then,
  ) = __$$RepoWithTargetBranchImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'target_branch') String targetBranch,
    String id,
    String path,
    String name,
    @JsonKey(name: 'display_name') String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    DateTime createdAt,
    DateTime updatedAt,
  });
}

/// @nodoc
class __$$RepoWithTargetBranchImplCopyWithImpl<$Res>
    extends _$RepoWithTargetBranchCopyWithImpl<$Res, _$RepoWithTargetBranchImpl>
    implements _$$RepoWithTargetBranchImplCopyWith<$Res> {
  __$$RepoWithTargetBranchImplCopyWithImpl(
    _$RepoWithTargetBranchImpl _value,
    $Res Function(_$RepoWithTargetBranchImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of RepoWithTargetBranch
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? targetBranch = null,
    Object? id = null,
    Object? path = null,
    Object? name = null,
    Object? displayName = null,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = null,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$RepoWithTargetBranchImpl(
        targetBranch:
            null == targetBranch
                ? _value.targetBranch
                : targetBranch // ignore: cast_nullable_to_non_nullable
                    as String,
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        path:
            null == path
                ? _value.path
                : path // ignore: cast_nullable_to_non_nullable
                    as String,
        name:
            null == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                    as String,
        displayName:
            null == displayName
                ? _value.displayName
                : displayName // ignore: cast_nullable_to_non_nullable
                    as String,
        setupScript:
            freezed == setupScript
                ? _value.setupScript
                : setupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        cleanupScript:
            freezed == cleanupScript
                ? _value.cleanupScript
                : cleanupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        archiveScript:
            freezed == archiveScript
                ? _value.archiveScript
                : archiveScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        copyFiles:
            freezed == copyFiles
                ? _value.copyFiles
                : copyFiles // ignore: cast_nullable_to_non_nullable
                    as String?,
        parallelSetupScript:
            null == parallelSetupScript
                ? _value.parallelSetupScript
                : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                    as bool,
        devServerScript:
            freezed == devServerScript
                ? _value.devServerScript
                : devServerScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultTargetBranch:
            freezed == defaultTargetBranch
                ? _value.defaultTargetBranch
                : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultWorkingDir:
            freezed == defaultWorkingDir
                ? _value.defaultWorkingDir
                : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
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
class _$RepoWithTargetBranchImpl implements _RepoWithTargetBranch {
  const _$RepoWithTargetBranchImpl({
    @JsonKey(name: 'target_branch') required this.targetBranch,
    required this.id,
    required this.path,
    required this.name,
    @JsonKey(name: 'display_name') required this.displayName,
    @JsonKey(name: 'setup_script') this.setupScript,
    @JsonKey(name: 'cleanup_script') this.cleanupScript,
    @JsonKey(name: 'archive_script') this.archiveScript,
    @JsonKey(name: 'copy_files') this.copyFiles,
    @JsonKey(name: 'parallel_setup_script') required this.parallelSetupScript,
    @JsonKey(name: 'dev_server_script') this.devServerScript,
    @JsonKey(name: 'default_target_branch') this.defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') this.defaultWorkingDir,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$RepoWithTargetBranchImpl.fromJson(Map<String, dynamic> json) =>
      _$$RepoWithTargetBranchImplFromJson(json);

  @override
  @JsonKey(name: 'target_branch')
  final String targetBranch;
  @override
  final String id;
  @override
  final String path;
  @override
  final String name;
  @override
  @JsonKey(name: 'display_name')
  final String displayName;
  @override
  @JsonKey(name: 'setup_script')
  final String? setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  final String? cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  final String? archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  final String? copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  final bool parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  final String? devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  final String? defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  final String? defaultWorkingDir;
  @override
  final DateTime createdAt;
  @override
  final DateTime updatedAt;

  @override
  String toString() {
    return 'RepoWithTargetBranch(targetBranch: $targetBranch, id: $id, path: $path, name: $name, displayName: $displayName, setupScript: $setupScript, cleanupScript: $cleanupScript, archiveScript: $archiveScript, copyFiles: $copyFiles, parallelSetupScript: $parallelSetupScript, devServerScript: $devServerScript, defaultTargetBranch: $defaultTargetBranch, defaultWorkingDir: $defaultWorkingDir, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RepoWithTargetBranchImpl &&
            (identical(other.targetBranch, targetBranch) ||
                other.targetBranch == targetBranch) &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.path, path) || other.path == path) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName) &&
            (identical(other.setupScript, setupScript) ||
                other.setupScript == setupScript) &&
            (identical(other.cleanupScript, cleanupScript) ||
                other.cleanupScript == cleanupScript) &&
            (identical(other.archiveScript, archiveScript) ||
                other.archiveScript == archiveScript) &&
            (identical(other.copyFiles, copyFiles) ||
                other.copyFiles == copyFiles) &&
            (identical(other.parallelSetupScript, parallelSetupScript) ||
                other.parallelSetupScript == parallelSetupScript) &&
            (identical(other.devServerScript, devServerScript) ||
                other.devServerScript == devServerScript) &&
            (identical(other.defaultTargetBranch, defaultTargetBranch) ||
                other.defaultTargetBranch == defaultTargetBranch) &&
            (identical(other.defaultWorkingDir, defaultWorkingDir) ||
                other.defaultWorkingDir == defaultWorkingDir) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    targetBranch,
    id,
    path,
    name,
    displayName,
    setupScript,
    cleanupScript,
    archiveScript,
    copyFiles,
    parallelSetupScript,
    devServerScript,
    defaultTargetBranch,
    defaultWorkingDir,
    createdAt,
    updatedAt,
  );

  /// Create a copy of RepoWithTargetBranch
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$RepoWithTargetBranchImplCopyWith<_$RepoWithTargetBranchImpl>
  get copyWith =>
      __$$RepoWithTargetBranchImplCopyWithImpl<_$RepoWithTargetBranchImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$RepoWithTargetBranchImplToJson(this);
  }
}

abstract class _RepoWithTargetBranch implements RepoWithTargetBranch {
  const factory _RepoWithTargetBranch({
    @JsonKey(name: 'target_branch') required final String targetBranch,
    required final String id,
    required final String path,
    required final String name,
    @JsonKey(name: 'display_name') required final String displayName,
    @JsonKey(name: 'setup_script') final String? setupScript,
    @JsonKey(name: 'cleanup_script') final String? cleanupScript,
    @JsonKey(name: 'archive_script') final String? archiveScript,
    @JsonKey(name: 'copy_files') final String? copyFiles,
    @JsonKey(name: 'parallel_setup_script')
    required final bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') final String? devServerScript,
    @JsonKey(name: 'default_target_branch') final String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') final String? defaultWorkingDir,
    required final DateTime createdAt,
    required final DateTime updatedAt,
  }) = _$RepoWithTargetBranchImpl;

  factory _RepoWithTargetBranch.fromJson(Map<String, dynamic> json) =
      _$RepoWithTargetBranchImpl.fromJson;

  @override
  @JsonKey(name: 'target_branch')
  String get targetBranch;
  @override
  String get id;
  @override
  String get path;
  @override
  String get name;
  @override
  @JsonKey(name: 'display_name')
  String get displayName;
  @override
  @JsonKey(name: 'setup_script')
  String? get setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  String? get archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  String? get copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  bool get parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir;
  @override
  DateTime get createdAt;
  @override
  DateTime get updatedAt;

  /// Create a copy of RepoWithTargetBranch
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$RepoWithTargetBranchImplCopyWith<_$RepoWithTargetBranchImpl>
  get copyWith => throw _privateConstructorUsedError;
}

UpdateRepo _$UpdateRepoFromJson(Map<String, dynamic> json) {
  return _UpdateRepo.fromJson(json);
}

/// @nodoc
mixin _$UpdateRepo {
  @JsonKey(name: 'display_name')
  String? get displayName => throw _privateConstructorUsedError;
  @JsonKey(name: 'setup_script')
  String? get setupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'archive_script')
  String? get archiveScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'copy_files')
  String? get copyFiles => throw _privateConstructorUsedError;
  @JsonKey(name: 'parallel_setup_script')
  bool? get parallelSetupScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch => throw _privateConstructorUsedError;
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir => throw _privateConstructorUsedError;

  /// Serializes this UpdateRepo to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of UpdateRepo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $UpdateRepoCopyWith<UpdateRepo> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UpdateRepoCopyWith<$Res> {
  factory $UpdateRepoCopyWith(
    UpdateRepo value,
    $Res Function(UpdateRepo) then,
  ) = _$UpdateRepoCopyWithImpl<$Res, UpdateRepo>;
  @useResult
  $Res call({
    @JsonKey(name: 'display_name') String? displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool? parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
  });
}

/// @nodoc
class _$UpdateRepoCopyWithImpl<$Res, $Val extends UpdateRepo>
    implements $UpdateRepoCopyWith<$Res> {
  _$UpdateRepoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of UpdateRepo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? displayName = freezed,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = freezed,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
  }) {
    return _then(
      _value.copyWith(
            displayName:
                freezed == displayName
                    ? _value.displayName
                    : displayName // ignore: cast_nullable_to_non_nullable
                        as String?,
            setupScript:
                freezed == setupScript
                    ? _value.setupScript
                    : setupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            cleanupScript:
                freezed == cleanupScript
                    ? _value.cleanupScript
                    : cleanupScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            archiveScript:
                freezed == archiveScript
                    ? _value.archiveScript
                    : archiveScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            copyFiles:
                freezed == copyFiles
                    ? _value.copyFiles
                    : copyFiles // ignore: cast_nullable_to_non_nullable
                        as String?,
            parallelSetupScript:
                freezed == parallelSetupScript
                    ? _value.parallelSetupScript
                    : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                        as bool?,
            devServerScript:
                freezed == devServerScript
                    ? _value.devServerScript
                    : devServerScript // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultTargetBranch:
                freezed == defaultTargetBranch
                    ? _value.defaultTargetBranch
                    : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                        as String?,
            defaultWorkingDir:
                freezed == defaultWorkingDir
                    ? _value.defaultWorkingDir
                    : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
                        as String?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$UpdateRepoImplCopyWith<$Res>
    implements $UpdateRepoCopyWith<$Res> {
  factory _$$UpdateRepoImplCopyWith(
    _$UpdateRepoImpl value,
    $Res Function(_$UpdateRepoImpl) then,
  ) = __$$UpdateRepoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'display_name') String? displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool? parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
  });
}

/// @nodoc
class __$$UpdateRepoImplCopyWithImpl<$Res>
    extends _$UpdateRepoCopyWithImpl<$Res, _$UpdateRepoImpl>
    implements _$$UpdateRepoImplCopyWith<$Res> {
  __$$UpdateRepoImplCopyWithImpl(
    _$UpdateRepoImpl _value,
    $Res Function(_$UpdateRepoImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of UpdateRepo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? displayName = freezed,
    Object? setupScript = freezed,
    Object? cleanupScript = freezed,
    Object? archiveScript = freezed,
    Object? copyFiles = freezed,
    Object? parallelSetupScript = freezed,
    Object? devServerScript = freezed,
    Object? defaultTargetBranch = freezed,
    Object? defaultWorkingDir = freezed,
  }) {
    return _then(
      _$UpdateRepoImpl(
        displayName:
            freezed == displayName
                ? _value.displayName
                : displayName // ignore: cast_nullable_to_non_nullable
                    as String?,
        setupScript:
            freezed == setupScript
                ? _value.setupScript
                : setupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        cleanupScript:
            freezed == cleanupScript
                ? _value.cleanupScript
                : cleanupScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        archiveScript:
            freezed == archiveScript
                ? _value.archiveScript
                : archiveScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        copyFiles:
            freezed == copyFiles
                ? _value.copyFiles
                : copyFiles // ignore: cast_nullable_to_non_nullable
                    as String?,
        parallelSetupScript:
            freezed == parallelSetupScript
                ? _value.parallelSetupScript
                : parallelSetupScript // ignore: cast_nullable_to_non_nullable
                    as bool?,
        devServerScript:
            freezed == devServerScript
                ? _value.devServerScript
                : devServerScript // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultTargetBranch:
            freezed == defaultTargetBranch
                ? _value.defaultTargetBranch
                : defaultTargetBranch // ignore: cast_nullable_to_non_nullable
                    as String?,
        defaultWorkingDir:
            freezed == defaultWorkingDir
                ? _value.defaultWorkingDir
                : defaultWorkingDir // ignore: cast_nullable_to_non_nullable
                    as String?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$UpdateRepoImpl implements _UpdateRepo {
  const _$UpdateRepoImpl({
    @JsonKey(name: 'display_name') this.displayName,
    @JsonKey(name: 'setup_script') this.setupScript,
    @JsonKey(name: 'cleanup_script') this.cleanupScript,
    @JsonKey(name: 'archive_script') this.archiveScript,
    @JsonKey(name: 'copy_files') this.copyFiles,
    @JsonKey(name: 'parallel_setup_script') this.parallelSetupScript,
    @JsonKey(name: 'dev_server_script') this.devServerScript,
    @JsonKey(name: 'default_target_branch') this.defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') this.defaultWorkingDir,
  });

  factory _$UpdateRepoImpl.fromJson(Map<String, dynamic> json) =>
      _$$UpdateRepoImplFromJson(json);

  @override
  @JsonKey(name: 'display_name')
  final String? displayName;
  @override
  @JsonKey(name: 'setup_script')
  final String? setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  final String? cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  final String? archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  final String? copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  final bool? parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  final String? devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  final String? defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  final String? defaultWorkingDir;

  @override
  String toString() {
    return 'UpdateRepo(displayName: $displayName, setupScript: $setupScript, cleanupScript: $cleanupScript, archiveScript: $archiveScript, copyFiles: $copyFiles, parallelSetupScript: $parallelSetupScript, devServerScript: $devServerScript, defaultTargetBranch: $defaultTargetBranch, defaultWorkingDir: $defaultWorkingDir)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UpdateRepoImpl &&
            (identical(other.displayName, displayName) ||
                other.displayName == displayName) &&
            (identical(other.setupScript, setupScript) ||
                other.setupScript == setupScript) &&
            (identical(other.cleanupScript, cleanupScript) ||
                other.cleanupScript == cleanupScript) &&
            (identical(other.archiveScript, archiveScript) ||
                other.archiveScript == archiveScript) &&
            (identical(other.copyFiles, copyFiles) ||
                other.copyFiles == copyFiles) &&
            (identical(other.parallelSetupScript, parallelSetupScript) ||
                other.parallelSetupScript == parallelSetupScript) &&
            (identical(other.devServerScript, devServerScript) ||
                other.devServerScript == devServerScript) &&
            (identical(other.defaultTargetBranch, defaultTargetBranch) ||
                other.defaultTargetBranch == defaultTargetBranch) &&
            (identical(other.defaultWorkingDir, defaultWorkingDir) ||
                other.defaultWorkingDir == defaultWorkingDir));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    displayName,
    setupScript,
    cleanupScript,
    archiveScript,
    copyFiles,
    parallelSetupScript,
    devServerScript,
    defaultTargetBranch,
    defaultWorkingDir,
  );

  /// Create a copy of UpdateRepo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$UpdateRepoImplCopyWith<_$UpdateRepoImpl> get copyWith =>
      __$$UpdateRepoImplCopyWithImpl<_$UpdateRepoImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$UpdateRepoImplToJson(this);
  }
}

abstract class _UpdateRepo implements UpdateRepo {
  const factory _UpdateRepo({
    @JsonKey(name: 'display_name') final String? displayName,
    @JsonKey(name: 'setup_script') final String? setupScript,
    @JsonKey(name: 'cleanup_script') final String? cleanupScript,
    @JsonKey(name: 'archive_script') final String? archiveScript,
    @JsonKey(name: 'copy_files') final String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') final bool? parallelSetupScript,
    @JsonKey(name: 'dev_server_script') final String? devServerScript,
    @JsonKey(name: 'default_target_branch') final String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') final String? defaultWorkingDir,
  }) = _$UpdateRepoImpl;

  factory _UpdateRepo.fromJson(Map<String, dynamic> json) =
      _$UpdateRepoImpl.fromJson;

  @override
  @JsonKey(name: 'display_name')
  String? get displayName;
  @override
  @JsonKey(name: 'setup_script')
  String? get setupScript;
  @override
  @JsonKey(name: 'cleanup_script')
  String? get cleanupScript;
  @override
  @JsonKey(name: 'archive_script')
  String? get archiveScript;
  @override
  @JsonKey(name: 'copy_files')
  String? get copyFiles;
  @override
  @JsonKey(name: 'parallel_setup_script')
  bool? get parallelSetupScript;
  @override
  @JsonKey(name: 'dev_server_script')
  String? get devServerScript;
  @override
  @JsonKey(name: 'default_target_branch')
  String? get defaultTargetBranch;
  @override
  @JsonKey(name: 'default_working_dir')
  String? get defaultWorkingDir;

  /// Create a copy of UpdateRepo
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$UpdateRepoImplCopyWith<_$UpdateRepoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
