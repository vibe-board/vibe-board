import 'package:freezed_annotation/freezed_annotation.dart';

part 'scratch.freezed.dart';
part 'scratch.g.dart';

@freezed
sealed class Scratch with _$Scratch {
  const factory Scratch({
    required String id,
    @JsonKey(name: 'scratch_type') required String scratchType,
    @JsonKey(name: 'reference_id') required String referenceId,
    required String content,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
  }) = _Scratch;

  factory Scratch.fromJson(Map<String, dynamic> json) =>
      _$ScratchFromJson(json);
}
