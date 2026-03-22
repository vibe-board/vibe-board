import 'package:freezed_annotation/freezed_annotation.dart';

part 'project.freezed.dart';
part 'project.g.dart';

@freezed
sealed class Project with _$Project {
  const factory Project({
    required String id,
    required String name,
    String? defaultAgentWorkingDir,
    String? remoteProjectId,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Project;

  factory Project.fromJson(Map<String, dynamic> json) =>
      _$ProjectFromJson(json);
}

@freezed
sealed class CreateProject with _$CreateProject {
  const factory CreateProject({
    required String name,
    required List<CreateProjectRepo> repositories,
  }) = _CreateProject;

  factory CreateProject.fromJson(Map<String, dynamic> json) =>
      _$CreateProjectFromJson(json);
}

@freezed
sealed class UpdateProject with _$UpdateProject {
  const factory UpdateProject({
    String? name,
  }) = _UpdateProject;

  factory UpdateProject.fromJson(Map<String, dynamic> json) =>
      _$UpdateProjectFromJson(json);
}

@freezed
sealed class CreateProjectRepo with _$CreateProjectRepo {
  const factory CreateProjectRepo({
    required String displayName,
    required String gitRepoPath,
  }) = _CreateProjectRepo;

  factory CreateProjectRepo.fromJson(Map<String, dynamic> json) =>
      _$CreateProjectRepoFromJson(json);
}
