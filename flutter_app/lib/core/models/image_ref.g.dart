// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'image_ref.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ImageMetadataImpl _$$ImageMetadataImplFromJson(Map<String, dynamic> json) =>
    _$ImageMetadataImpl(
      id: json['id'] as String,
      taskId: json['task_id'] as String,
      filename: json['filename'] as String,
      contentType: json['content_type'] as String?,
      fileSize: (json['file_size'] as num?)?.toInt(),
      createdAt: json['created_at'] as String,
    );

Map<String, dynamic> _$$ImageMetadataImplToJson(_$ImageMetadataImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'task_id': instance.taskId,
      'filename': instance.filename,
      'content_type': instance.contentType,
      'file_size': instance.fileSize,
      'created_at': instance.createdAt,
    };
