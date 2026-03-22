// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'commit.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CommitImpl _$$CommitImplFromJson(Map<String, dynamic> json) => _$CommitImpl(
  sha: json['sha'] as String,
  message: json['message'] as String,
  author: json['author'] as String,
  authorEmail: json['author_email'] as String?,
  date: json['date'] as String,
  isHead: json['is_head'] as bool?,
  isMerge: json['is_merge'] as bool?,
);

Map<String, dynamic> _$$CommitImplToJson(_$CommitImpl instance) =>
    <String, dynamic>{
      'sha': instance.sha,
      'message': instance.message,
      'author': instance.author,
      'author_email': instance.authorEmail,
      'date': instance.date,
      'is_head': instance.isHead,
      'is_merge': instance.isMerge,
    };
