import 'package:freezed_annotation/freezed_annotation.dart';

part 'repo.freezed.dart';
part 'repo.g.dart';

@freezed
sealed class Repo with _$Repo {
  const factory Repo({
    required String id,
    required String path,
    required String name,
    @JsonKey(name: 'display_name') required String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') required bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Repo;

  factory Repo.fromJson(Map<String, dynamic> json) => _$RepoFromJson(json);
}

@freezed
sealed class RepoWithTargetBranch with _$RepoWithTargetBranch {
  const factory RepoWithTargetBranch({
    @JsonKey(name: 'target_branch') required String targetBranch,
    required String id,
    required String path,
    required String name,
    @JsonKey(name: 'display_name') required String displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') required bool parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _RepoWithTargetBranch;

  factory RepoWithTargetBranch.fromJson(Map<String, dynamic> json) =>
      _$RepoWithTargetBranchFromJson(json);
}

@freezed
sealed class UpdateRepo with _$UpdateRepo {
  const factory UpdateRepo({
    @JsonKey(name: 'display_name') String? displayName,
    @JsonKey(name: 'setup_script') String? setupScript,
    @JsonKey(name: 'cleanup_script') String? cleanupScript,
    @JsonKey(name: 'archive_script') String? archiveScript,
    @JsonKey(name: 'copy_files') String? copyFiles,
    @JsonKey(name: 'parallel_setup_script') bool? parallelSetupScript,
    @JsonKey(name: 'dev_server_script') String? devServerScript,
    @JsonKey(name: 'default_target_branch') String? defaultTargetBranch,
    @JsonKey(name: 'default_working_dir') String? defaultWorkingDir,
  }) = _UpdateRepo;

  factory UpdateRepo.fromJson(Map<String, dynamic> json) =>
      _$UpdateRepoFromJson(json);
}
