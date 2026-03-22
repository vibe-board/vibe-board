// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scratch.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ScratchImpl _$$ScratchImplFromJson(Map<String, dynamic> json) =>
    _$ScratchImpl(
      id: json['id'] as String,
      scratchType: json['scratch_type'] as String,
      referenceId: json['reference_id'] as String,
      content: json['content'] as String,
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
    );

Map<String, dynamic> _$$ScratchImplToJson(_$ScratchImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'scratch_type': instance.scratchType,
      'reference_id': instance.referenceId,
      'content': instance.content,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
    };
