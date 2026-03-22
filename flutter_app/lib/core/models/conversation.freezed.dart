// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'conversation.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

ConversationEntry _$ConversationEntryFromJson(Map<String, dynamic> json) {
  return _ConversationEntry.fromJson(json);
}

/// @nodoc
mixin _$ConversationEntry {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'session_id')
  String get sessionId => throw _privateConstructorUsedError;
  String get role => throw _privateConstructorUsedError;
  Map<String, dynamic> get content => throw _privateConstructorUsedError;
  @JsonKey(name: 'created_at')
  String get createdAt => throw _privateConstructorUsedError;

  /// Serializes this ConversationEntry to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ConversationEntry
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ConversationEntryCopyWith<ConversationEntry> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ConversationEntryCopyWith<$Res> {
  factory $ConversationEntryCopyWith(
    ConversationEntry value,
    $Res Function(ConversationEntry) then,
  ) = _$ConversationEntryCopyWithImpl<$Res, ConversationEntry>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'session_id') String sessionId,
    String role,
    Map<String, dynamic> content,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class _$ConversationEntryCopyWithImpl<$Res, $Val extends ConversationEntry>
    implements $ConversationEntryCopyWith<$Res> {
  _$ConversationEntryCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ConversationEntry
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? role = null,
    Object? content = null,
    Object? createdAt = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            sessionId:
                null == sessionId
                    ? _value.sessionId
                    : sessionId // ignore: cast_nullable_to_non_nullable
                        as String,
            role:
                null == role
                    ? _value.role
                    : role // ignore: cast_nullable_to_non_nullable
                        as String,
            content:
                null == content
                    ? _value.content
                    : content // ignore: cast_nullable_to_non_nullable
                        as Map<String, dynamic>,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$ConversationEntryImplCopyWith<$Res>
    implements $ConversationEntryCopyWith<$Res> {
  factory _$$ConversationEntryImplCopyWith(
    _$ConversationEntryImpl value,
    $Res Function(_$ConversationEntryImpl) then,
  ) = __$$ConversationEntryImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'session_id') String sessionId,
    String role,
    Map<String, dynamic> content,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class __$$ConversationEntryImplCopyWithImpl<$Res>
    extends _$ConversationEntryCopyWithImpl<$Res, _$ConversationEntryImpl>
    implements _$$ConversationEntryImplCopyWith<$Res> {
  __$$ConversationEntryImplCopyWithImpl(
    _$ConversationEntryImpl _value,
    $Res Function(_$ConversationEntryImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of ConversationEntry
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? sessionId = null,
    Object? role = null,
    Object? content = null,
    Object? createdAt = null,
  }) {
    return _then(
      _$ConversationEntryImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        sessionId:
            null == sessionId
                ? _value.sessionId
                : sessionId // ignore: cast_nullable_to_non_nullable
                    as String,
        role:
            null == role
                ? _value.role
                : role // ignore: cast_nullable_to_non_nullable
                    as String,
        content:
            null == content
                ? _value._content
                : content // ignore: cast_nullable_to_non_nullable
                    as Map<String, dynamic>,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$ConversationEntryImpl implements _ConversationEntry {
  const _$ConversationEntryImpl({
    required this.id,
    @JsonKey(name: 'session_id') required this.sessionId,
    required this.role,
    required final Map<String, dynamic> content,
    @JsonKey(name: 'created_at') required this.createdAt,
  }) : _content = content;

  factory _$ConversationEntryImpl.fromJson(Map<String, dynamic> json) =>
      _$$ConversationEntryImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'session_id')
  final String sessionId;
  @override
  final String role;
  final Map<String, dynamic> _content;
  @override
  Map<String, dynamic> get content {
    if (_content is EqualUnmodifiableMapView) return _content;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_content);
  }

  @override
  @JsonKey(name: 'created_at')
  final String createdAt;

  @override
  String toString() {
    return 'ConversationEntry(id: $id, sessionId: $sessionId, role: $role, content: $content, createdAt: $createdAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ConversationEntryImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.role, role) || other.role == role) &&
            const DeepCollectionEquality().equals(other._content, _content) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    sessionId,
    role,
    const DeepCollectionEquality().hash(_content),
    createdAt,
  );

  /// Create a copy of ConversationEntry
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ConversationEntryImplCopyWith<_$ConversationEntryImpl> get copyWith =>
      __$$ConversationEntryImplCopyWithImpl<_$ConversationEntryImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$ConversationEntryImplToJson(this);
  }
}

abstract class _ConversationEntry implements ConversationEntry {
  const factory _ConversationEntry({
    required final String id,
    @JsonKey(name: 'session_id') required final String sessionId,
    required final String role,
    required final Map<String, dynamic> content,
    @JsonKey(name: 'created_at') required final String createdAt,
  }) = _$ConversationEntryImpl;

  factory _ConversationEntry.fromJson(Map<String, dynamic> json) =
      _$ConversationEntryImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'session_id')
  String get sessionId;
  @override
  String get role;
  @override
  Map<String, dynamic> get content;
  @override
  @JsonKey(name: 'created_at')
  String get createdAt;

  /// Create a copy of ConversationEntry
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ConversationEntryImplCopyWith<_$ConversationEntryImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

QueueStatus _$QueueStatusFromJson(Map<String, dynamic> json) {
  return _QueueStatus.fromJson(json);
}

/// @nodoc
mixin _$QueueStatus {
  List<QueuedMessage> get messages => throw _privateConstructorUsedError;

  /// Serializes this QueueStatus to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of QueueStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $QueueStatusCopyWith<QueueStatus> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $QueueStatusCopyWith<$Res> {
  factory $QueueStatusCopyWith(
    QueueStatus value,
    $Res Function(QueueStatus) then,
  ) = _$QueueStatusCopyWithImpl<$Res, QueueStatus>;
  @useResult
  $Res call({List<QueuedMessage> messages});
}

/// @nodoc
class _$QueueStatusCopyWithImpl<$Res, $Val extends QueueStatus>
    implements $QueueStatusCopyWith<$Res> {
  _$QueueStatusCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of QueueStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? messages = null}) {
    return _then(
      _value.copyWith(
            messages:
                null == messages
                    ? _value.messages
                    : messages // ignore: cast_nullable_to_non_nullable
                        as List<QueuedMessage>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$QueueStatusImplCopyWith<$Res>
    implements $QueueStatusCopyWith<$Res> {
  factory _$$QueueStatusImplCopyWith(
    _$QueueStatusImpl value,
    $Res Function(_$QueueStatusImpl) then,
  ) = __$$QueueStatusImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({List<QueuedMessage> messages});
}

/// @nodoc
class __$$QueueStatusImplCopyWithImpl<$Res>
    extends _$QueueStatusCopyWithImpl<$Res, _$QueueStatusImpl>
    implements _$$QueueStatusImplCopyWith<$Res> {
  __$$QueueStatusImplCopyWithImpl(
    _$QueueStatusImpl _value,
    $Res Function(_$QueueStatusImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of QueueStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? messages = null}) {
    return _then(
      _$QueueStatusImpl(
        messages:
            null == messages
                ? _value._messages
                : messages // ignore: cast_nullable_to_non_nullable
                    as List<QueuedMessage>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$QueueStatusImpl implements _QueueStatus {
  const _$QueueStatusImpl({required final List<QueuedMessage> messages})
    : _messages = messages;

  factory _$QueueStatusImpl.fromJson(Map<String, dynamic> json) =>
      _$$QueueStatusImplFromJson(json);

  final List<QueuedMessage> _messages;
  @override
  List<QueuedMessage> get messages {
    if (_messages is EqualUnmodifiableListView) return _messages;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_messages);
  }

  @override
  String toString() {
    return 'QueueStatus(messages: $messages)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$QueueStatusImpl &&
            const DeepCollectionEquality().equals(other._messages, _messages));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, const DeepCollectionEquality().hash(_messages));

  /// Create a copy of QueueStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$QueueStatusImplCopyWith<_$QueueStatusImpl> get copyWith =>
      __$$QueueStatusImplCopyWithImpl<_$QueueStatusImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$QueueStatusImplToJson(this);
  }
}

abstract class _QueueStatus implements QueueStatus {
  const factory _QueueStatus({required final List<QueuedMessage> messages}) =
      _$QueueStatusImpl;

  factory _QueueStatus.fromJson(Map<String, dynamic> json) =
      _$QueueStatusImpl.fromJson;

  @override
  List<QueuedMessage> get messages;

  /// Create a copy of QueueStatus
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$QueueStatusImplCopyWith<_$QueueStatusImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

QueuedMessage _$QueuedMessageFromJson(Map<String, dynamic> json) {
  return _QueuedMessage.fromJson(json);
}

/// @nodoc
mixin _$QueuedMessage {
  String get id => throw _privateConstructorUsedError;
  String get message => throw _privateConstructorUsedError;
  String get status => throw _privateConstructorUsedError;
  @JsonKey(name: 'created_at')
  String get createdAt => throw _privateConstructorUsedError;

  /// Serializes this QueuedMessage to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of QueuedMessage
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $QueuedMessageCopyWith<QueuedMessage> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $QueuedMessageCopyWith<$Res> {
  factory $QueuedMessageCopyWith(
    QueuedMessage value,
    $Res Function(QueuedMessage) then,
  ) = _$QueuedMessageCopyWithImpl<$Res, QueuedMessage>;
  @useResult
  $Res call({
    String id,
    String message,
    String status,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class _$QueuedMessageCopyWithImpl<$Res, $Val extends QueuedMessage>
    implements $QueuedMessageCopyWith<$Res> {
  _$QueuedMessageCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of QueuedMessage
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? message = null,
    Object? status = null,
    Object? createdAt = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            message:
                null == message
                    ? _value.message
                    : message // ignore: cast_nullable_to_non_nullable
                        as String,
            status:
                null == status
                    ? _value.status
                    : status // ignore: cast_nullable_to_non_nullable
                        as String,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$QueuedMessageImplCopyWith<$Res>
    implements $QueuedMessageCopyWith<$Res> {
  factory _$$QueuedMessageImplCopyWith(
    _$QueuedMessageImpl value,
    $Res Function(_$QueuedMessageImpl) then,
  ) = __$$QueuedMessageImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String message,
    String status,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class __$$QueuedMessageImplCopyWithImpl<$Res>
    extends _$QueuedMessageCopyWithImpl<$Res, _$QueuedMessageImpl>
    implements _$$QueuedMessageImplCopyWith<$Res> {
  __$$QueuedMessageImplCopyWithImpl(
    _$QueuedMessageImpl _value,
    $Res Function(_$QueuedMessageImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of QueuedMessage
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? message = null,
    Object? status = null,
    Object? createdAt = null,
  }) {
    return _then(
      _$QueuedMessageImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        message:
            null == message
                ? _value.message
                : message // ignore: cast_nullable_to_non_nullable
                    as String,
        status:
            null == status
                ? _value.status
                : status // ignore: cast_nullable_to_non_nullable
                    as String,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$QueuedMessageImpl implements _QueuedMessage {
  const _$QueuedMessageImpl({
    required this.id,
    required this.message,
    required this.status,
    @JsonKey(name: 'created_at') required this.createdAt,
  });

  factory _$QueuedMessageImpl.fromJson(Map<String, dynamic> json) =>
      _$$QueuedMessageImplFromJson(json);

  @override
  final String id;
  @override
  final String message;
  @override
  final String status;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;

  @override
  String toString() {
    return 'QueuedMessage(id: $id, message: $message, status: $status, createdAt: $createdAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$QueuedMessageImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, id, message, status, createdAt);

  /// Create a copy of QueuedMessage
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$QueuedMessageImplCopyWith<_$QueuedMessageImpl> get copyWith =>
      __$$QueuedMessageImplCopyWithImpl<_$QueuedMessageImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$QueuedMessageImplToJson(this);
  }
}

abstract class _QueuedMessage implements QueuedMessage {
  const factory _QueuedMessage({
    required final String id,
    required final String message,
    required final String status,
    @JsonKey(name: 'created_at') required final String createdAt,
  }) = _$QueuedMessageImpl;

  factory _QueuedMessage.fromJson(Map<String, dynamic> json) =
      _$QueuedMessageImpl.fromJson;

  @override
  String get id;
  @override
  String get message;
  @override
  String get status;
  @override
  @JsonKey(name: 'created_at')
  String get createdAt;

  /// Create a copy of QueuedMessage
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$QueuedMessageImplCopyWith<_$QueuedMessageImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
