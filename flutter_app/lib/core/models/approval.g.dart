// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'approval.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ApprovalInfoImpl _$$ApprovalInfoImplFromJson(Map<String, dynamic> json) =>
    _$ApprovalInfoImpl(
      approvalId: json['approval_id'] as String,
      toolName: json['tool_name'] as String,
      executionProcessId: json['execution_process_id'] as String,
      isQuestion: json['is_question'] as bool,
      createdAt: json['createdAt'] as String,
      timeoutAt: json['timeoutAt'] as String,
    );

Map<String, dynamic> _$$ApprovalInfoImplToJson(_$ApprovalInfoImpl instance) =>
    <String, dynamic>{
      'approval_id': instance.approvalId,
      'tool_name': instance.toolName,
      'execution_process_id': instance.executionProcessId,
      'is_question': instance.isQuestion,
      'createdAt': instance.createdAt,
      'timeoutAt': instance.timeoutAt,
    };

_$QuestionAnswerImpl _$$QuestionAnswerImplFromJson(Map<String, dynamic> json) =>
    _$QuestionAnswerImpl(
      question: json['question'] as String,
      answer:
          (json['answer'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$$QuestionAnswerImplToJson(
  _$QuestionAnswerImpl instance,
) => <String, dynamic>{
  'question': instance.question,
  'answer': instance.answer,
};
