import 'package:freezed_annotation/freezed_annotation.dart';

part 'conversation.freezed.dart';
part 'conversation.g.dart';

@freezed
sealed class ConversationEntry with _$ConversationEntry {
  const factory ConversationEntry({
    required String id,
    @JsonKey(name: 'session_id') required String sessionId,
    required String role,
    required Map<String, dynamic> content,
    @JsonKey(name: 'created_at') required String createdAt,
  }) = _ConversationEntry;

  factory ConversationEntry.fromJson(Map<String, dynamic> json) =>
      _$ConversationEntryFromJson(json);
}

@freezed
sealed class QueueStatus with _$QueueStatus {
  const factory QueueStatus({
    required List<QueuedMessage> messages,
  }) = _QueueStatus;

  factory QueueStatus.fromJson(Map<String, dynamic> json) =>
      _$QueueStatusFromJson(json);
}

@freezed
sealed class QueuedMessage with _$QueuedMessage {
  const factory QueuedMessage({
    required String id,
    required String message,
    required String status,
    @JsonKey(name: 'created_at') required String createdAt,
  }) = _QueuedMessage;

  factory QueuedMessage.fromJson(Map<String, dynamic> json) =>
      _$QueuedMessageFromJson(json);
}
