// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'project.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ProjectImpl _$$ProjectImplFromJson(Map<String, dynamic> json) =>
    _$ProjectImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      defaultAgentWorkingDir: json['defaultAgentWorkingDir'] as String?,
      remoteProjectId: json['remoteProjectId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$$ProjectImplToJson(_$ProjectImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'defaultAgentWorkingDir': instance.defaultAgentWorkingDir,
      'remoteProjectId': instance.remoteProjectId,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };

_$CreateProjectImpl _$$CreateProjectImplFromJson(Map<String, dynamic> json) =>
    _$CreateProjectImpl(
      name: json['name'] as String,
      repositories:
          (json['repositories'] as List<dynamic>)
              .map((e) => CreateProjectRepo.fromJson(e as Map<String, dynamic>))
              .toList(),
    );

Map<String, dynamic> _$$CreateProjectImplToJson(_$CreateProjectImpl instance) =>
    <String, dynamic>{
      'name': instance.name,
      'repositories': instance.repositories,
    };

_$UpdateProjectImpl _$$UpdateProjectImplFromJson(Map<String, dynamic> json) =>
    _$UpdateProjectImpl(name: json['name'] as String?);

Map<String, dynamic> _$$UpdateProjectImplToJson(_$UpdateProjectImpl instance) =>
    <String, dynamic>{'name': instance.name};

_$CreateProjectRepoImpl _$$CreateProjectRepoImplFromJson(
  Map<String, dynamic> json,
) => _$CreateProjectRepoImpl(
  displayName: json['displayName'] as String,
  gitRepoPath: json['gitRepoPath'] as String,
);

Map<String, dynamic> _$$CreateProjectRepoImplToJson(
  _$CreateProjectRepoImpl instance,
) => <String, dynamic>{
  'displayName': instance.displayName,
  'gitRepoPath': instance.gitRepoPath,
};
