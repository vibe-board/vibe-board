import 'package:freezed_annotation/freezed_annotation.dart';

part 'approval.freezed.dart';
part 'approval.g.dart';

@freezed
sealed class ApprovalInfo with _$ApprovalInfo {
  const factory ApprovalInfo({
    @JsonKey(name: 'approval_id') required String approvalId,
    @JsonKey(name: 'tool_name') required String toolName,
    @JsonKey(name: 'execution_process_id') required String executionProcessId,
    @JsonKey(name: 'is_question') required bool isQuestion,
    required String createdAt,
    required String timeoutAt,
  }) = _ApprovalInfo;

  factory ApprovalInfo.fromJson(Map<String, dynamic> json) =>
      _$ApprovalInfoFromJson(json);
}

@freezed
sealed class QuestionAnswer with _$QuestionAnswer {
  const factory QuestionAnswer({
    required String question,
    required List<String> answer,
  }) = _QuestionAnswer;

  factory QuestionAnswer.fromJson(Map<String, dynamic> json) =>
      _$QuestionAnswerFromJson(json);
}
