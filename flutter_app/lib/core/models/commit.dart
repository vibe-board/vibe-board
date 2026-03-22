import 'package:freezed_annotation/freezed_annotation.dart';

part 'commit.freezed.dart';
part 'commit.g.dart';

@freezed
sealed class Commit with _$Commit {
  const factory Commit({
    required String sha,
    required String message,
    required String author,
    @JsonKey(name: 'author_email') String? authorEmail,
    required String date,
    @JsonKey(name: 'is_head') bool? isHead,
    @JsonKey(name: 'is_merge') bool? isMerge,
  }) = _Commit;

  factory Commit.fromJson(Map<String, dynamic> json) =>
      _$CommitFromJson(json);
}
