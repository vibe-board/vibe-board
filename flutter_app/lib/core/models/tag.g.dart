// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tag.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$TagImpl _$$TagImplFromJson(Map<String, dynamic> json) => _$TagImpl(
  id: json['id'] as String,
  tagName: json['tag_name'] as String,
  content: json['content'] as String,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$$TagImplToJson(_$TagImpl instance) => <String, dynamic>{
  'id': instance.id,
  'tag_name': instance.tagName,
  'content': instance.content,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};

_$CreateTagImpl _$$CreateTagImplFromJson(Map<String, dynamic> json) =>
    _$CreateTagImpl(
      tagName: json['tag_name'] as String,
      content: json['content'] as String,
    );

Map<String, dynamic> _$$CreateTagImplToJson(_$CreateTagImpl instance) =>
    <String, dynamic>{
      'tag_name': instance.tagName,
      'content': instance.content,
    };
