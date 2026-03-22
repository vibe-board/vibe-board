// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'diff.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DiffImpl _$$DiffImplFromJson(Map<String, dynamic> json) => _$DiffImpl(
  change: $enumDecode(_$DiffChangeKindEnumMap, json['change']),
  oldPath: json['oldPath'] as String?,
  newPath: json['newPath'] as String?,
  oldContent: json['oldContent'] as String?,
  newContent: json['newContent'] as String?,
  contentOmitted: json['contentOmitted'] as bool,
  additions: (json['additions'] as num?)?.toInt(),
  deletions: (json['deletions'] as num?)?.toInt(),
  repoId: json['repoId'] as String?,
);

Map<String, dynamic> _$$DiffImplToJson(_$DiffImpl instance) =>
    <String, dynamic>{
      'change': _$DiffChangeKindEnumMap[instance.change]!,
      'oldPath': instance.oldPath,
      'newPath': instance.newPath,
      'oldContent': instance.oldContent,
      'newContent': instance.newContent,
      'contentOmitted': instance.contentOmitted,
      'additions': instance.additions,
      'deletions': instance.deletions,
      'repoId': instance.repoId,
    };

const _$DiffChangeKindEnumMap = {
  DiffChangeKind.added: 'added',
  DiffChangeKind.deleted: 'deleted',
  DiffChangeKind.modified: 'modified',
  DiffChangeKind.renamed: 'renamed',
  DiffChangeKind.copied: 'copied',
  DiffChangeKind.permissionChange: 'permissionChange',
};
