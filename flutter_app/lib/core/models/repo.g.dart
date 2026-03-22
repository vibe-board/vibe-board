// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'repo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$RepoImpl _$$RepoImplFromJson(Map<String, dynamic> json) => _$RepoImpl(
  id: json['id'] as String,
  path: json['path'] as String,
  name: json['name'] as String,
  displayName: json['display_name'] as String,
  setupScript: json['setup_script'] as String?,
  cleanupScript: json['cleanup_script'] as String?,
  archiveScript: json['archive_script'] as String?,
  copyFiles: json['copy_files'] as String?,
  parallelSetupScript: json['parallel_setup_script'] as bool,
  devServerScript: json['dev_server_script'] as String?,
  defaultTargetBranch: json['default_target_branch'] as String?,
  defaultWorkingDir: json['default_working_dir'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$$RepoImplToJson(_$RepoImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'path': instance.path,
      'name': instance.name,
      'display_name': instance.displayName,
      'setup_script': instance.setupScript,
      'cleanup_script': instance.cleanupScript,
      'archive_script': instance.archiveScript,
      'copy_files': instance.copyFiles,
      'parallel_setup_script': instance.parallelSetupScript,
      'dev_server_script': instance.devServerScript,
      'default_target_branch': instance.defaultTargetBranch,
      'default_working_dir': instance.defaultWorkingDir,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };

_$RepoWithTargetBranchImpl _$$RepoWithTargetBranchImplFromJson(
  Map<String, dynamic> json,
) => _$RepoWithTargetBranchImpl(
  targetBranch: json['target_branch'] as String,
  id: json['id'] as String,
  path: json['path'] as String,
  name: json['name'] as String,
  displayName: json['display_name'] as String,
  setupScript: json['setup_script'] as String?,
  cleanupScript: json['cleanup_script'] as String?,
  archiveScript: json['archive_script'] as String?,
  copyFiles: json['copy_files'] as String?,
  parallelSetupScript: json['parallel_setup_script'] as bool,
  devServerScript: json['dev_server_script'] as String?,
  defaultTargetBranch: json['default_target_branch'] as String?,
  defaultWorkingDir: json['default_working_dir'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$$RepoWithTargetBranchImplToJson(
  _$RepoWithTargetBranchImpl instance,
) => <String, dynamic>{
  'target_branch': instance.targetBranch,
  'id': instance.id,
  'path': instance.path,
  'name': instance.name,
  'display_name': instance.displayName,
  'setup_script': instance.setupScript,
  'cleanup_script': instance.cleanupScript,
  'archive_script': instance.archiveScript,
  'copy_files': instance.copyFiles,
  'parallel_setup_script': instance.parallelSetupScript,
  'dev_server_script': instance.devServerScript,
  'default_target_branch': instance.defaultTargetBranch,
  'default_working_dir': instance.defaultWorkingDir,
  'createdAt': instance.createdAt.toIso8601String(),
  'updatedAt': instance.updatedAt.toIso8601String(),
};

_$UpdateRepoImpl _$$UpdateRepoImplFromJson(Map<String, dynamic> json) =>
    _$UpdateRepoImpl(
      displayName: json['display_name'] as String?,
      setupScript: json['setup_script'] as String?,
      cleanupScript: json['cleanup_script'] as String?,
      archiveScript: json['archive_script'] as String?,
      copyFiles: json['copy_files'] as String?,
      parallelSetupScript: json['parallel_setup_script'] as bool?,
      devServerScript: json['dev_server_script'] as String?,
      defaultTargetBranch: json['default_target_branch'] as String?,
      defaultWorkingDir: json['default_working_dir'] as String?,
    );

Map<String, dynamic> _$$UpdateRepoImplToJson(_$UpdateRepoImpl instance) =>
    <String, dynamic>{
      'display_name': instance.displayName,
      'setup_script': instance.setupScript,
      'cleanup_script': instance.cleanupScript,
      'archive_script': instance.archiveScript,
      'copy_files': instance.copyFiles,
      'parallel_setup_script': instance.parallelSetupScript,
      'dev_server_script': instance.devServerScript,
      'default_target_branch': instance.defaultTargetBranch,
      'default_working_dir': instance.defaultWorkingDir,
    };
