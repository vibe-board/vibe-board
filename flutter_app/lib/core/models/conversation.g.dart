// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ConversationEntryImpl _$$ConversationEntryImplFromJson(
  Map<String, dynamic> json,
) => _$ConversationEntryImpl(
  id: json['id'] as String,
  sessionId: json['session_id'] as String,
  role: json['role'] as String,
  content: json['content'] as Map<String, dynamic>,
  createdAt: json['created_at'] as String,
);

Map<String, dynamic> _$$ConversationEntryImplToJson(
  _$ConversationEntryImpl instance,
) => <String, dynamic>{
  'id': instance.id,
  'session_id': instance.sessionId,
  'role': instance.role,
  'content': instance.content,
  'created_at': instance.createdAt,
};

_$QueueStatusImpl _$$QueueStatusImplFromJson(Map<String, dynamic> json) =>
    _$QueueStatusImpl(
      messages:
          (json['messages'] as List<dynamic>)
              .map((e) => QueuedMessage.fromJson(e as Map<String, dynamic>))
              .toList(),
    );

Map<String, dynamic> _$$QueueStatusImplToJson(_$QueueStatusImpl instance) =>
    <String, dynamic>{'messages': instance.messages};

_$QueuedMessageImpl _$$QueuedMessageImplFromJson(Map<String, dynamic> json) =>
    _$QueuedMessageImpl(
      id: json['id'] as String,
      message: json['message'] as String,
      status: json['status'] as String,
      createdAt: json['created_at'] as String,
    );

Map<String, dynamic> _$$QueuedMessageImplToJson(_$QueuedMessageImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'message': instance.message,
      'status': instance.status,
      'created_at': instance.createdAt,
    };
