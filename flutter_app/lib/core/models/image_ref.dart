import 'package:freezed_annotation/freezed_annotation.dart';

part 'image_ref.freezed.dart';
part 'image_ref.g.dart';

@freezed
sealed class ImageMetadata with _$ImageMetadata {
  const factory ImageMetadata({
    required String id,
    @JsonKey(name: 'task_id') required String taskId,
    required String filename,
    @JsonKey(name: 'content_type') String? contentType,
    @JsonKey(name: 'file_size') int? fileSize,
    @JsonKey(name: 'created_at') required String createdAt,
  }) = _ImageMetadata;

  factory ImageMetadata.fromJson(Map<String, dynamic> json) =>
      _$ImageMetadataFromJson(json);
}
