import 'package:freezed_annotation/freezed_annotation.dart';
import 'enums.dart';

part 'diff.freezed.dart';
part 'diff.g.dart';

@freezed
sealed class Diff with _$Diff {
  const factory Diff({
    required DiffChangeKind change,
    @JsonKey(name: 'oldPath') String? oldPath,
    @JsonKey(name: 'newPath') String? newPath,
    @JsonKey(name: 'oldContent') String? oldContent,
    @JsonKey(name: 'newContent') String? newContent,
    @JsonKey(name: 'contentOmitted') required bool contentOmitted,
    int? additions,
    int? deletions,
    @JsonKey(name: 'repoId') String? repoId,
  }) = _Diff;

  factory Diff.fromJson(Map<String, dynamic> json) => _$DiffFromJson(json);
}
