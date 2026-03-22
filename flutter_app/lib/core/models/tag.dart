import 'package:freezed_annotation/freezed_annotation.dart';

part 'tag.freezed.dart';
part 'tag.g.dart';

@freezed
sealed class Tag with _$Tag {
  const factory Tag({
    required String id,
    @JsonKey(name: 'tag_name') required String tagName,
    required String content,
    required String createdAt,
    required String updatedAt,
  }) = _Tag;

  factory Tag.fromJson(Map<String, dynamic> json) => _$TagFromJson(json);
}

@freezed
sealed class CreateTag with _$CreateTag {
  const factory CreateTag({
    @JsonKey(name: 'tag_name') required String tagName,
    required String content,
  }) = _CreateTag;

  factory CreateTag.fromJson(Map<String, dynamic> json) =>
      _$CreateTagFromJson(json);
}
