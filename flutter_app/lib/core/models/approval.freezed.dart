// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'approval.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

ApprovalInfo _$ApprovalInfoFromJson(Map<String, dynamic> json) {
  return _ApprovalInfo.fromJson(json);
}

/// @nodoc
mixin _$ApprovalInfo {
  @JsonKey(name: 'approval_id')
  String get approvalId => throw _privateConstructorUsedError;
  @JsonKey(name: 'tool_name')
  String get toolName => throw _privateConstructorUsedError;
  @JsonKey(name: 'execution_process_id')
  String get executionProcessId => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_question')
  bool get isQuestion => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get timeoutAt => throw _privateConstructorUsedError;

  /// Serializes this ApprovalInfo to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ApprovalInfo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ApprovalInfoCopyWith<ApprovalInfo> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ApprovalInfoCopyWith<$Res> {
  factory $ApprovalInfoCopyWith(
    ApprovalInfo value,
    $Res Function(ApprovalInfo) then,
  ) = _$ApprovalInfoCopyWithImpl<$Res, ApprovalInfo>;
  @useResult
  $Res call({
    @JsonKey(name: 'approval_id') String approvalId,
    @JsonKey(name: 'tool_name') String toolName,
    @JsonKey(name: 'execution_process_id') String executionProcessId,
    @JsonKey(name: 'is_question') bool isQuestion,
    String createdAt,
    String timeoutAt,
  });
}

/// @nodoc
class _$ApprovalInfoCopyWithImpl<$Res, $Val extends ApprovalInfo>
    implements $ApprovalInfoCopyWith<$Res> {
  _$ApprovalInfoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ApprovalInfo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? approvalId = null,
    Object? toolName = null,
    Object? executionProcessId = null,
    Object? isQuestion = null,
    Object? createdAt = null,
    Object? timeoutAt = null,
  }) {
    return _then(
      _value.copyWith(
            approvalId:
                null == approvalId
                    ? _value.approvalId
                    : approvalId // ignore: cast_nullable_to_non_nullable
                        as String,
            toolName:
                null == toolName
                    ? _value.toolName
                    : toolName // ignore: cast_nullable_to_non_nullable
                        as String,
            executionProcessId:
                null == executionProcessId
                    ? _value.executionProcessId
                    : executionProcessId // ignore: cast_nullable_to_non_nullable
                        as String,
            isQuestion:
                null == isQuestion
                    ? _value.isQuestion
                    : isQuestion // ignore: cast_nullable_to_non_nullable
                        as bool,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
            timeoutAt:
                null == timeoutAt
                    ? _value.timeoutAt
                    : timeoutAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$ApprovalInfoImplCopyWith<$Res>
    implements $ApprovalInfoCopyWith<$Res> {
  factory _$$ApprovalInfoImplCopyWith(
    _$ApprovalInfoImpl value,
    $Res Function(_$ApprovalInfoImpl) then,
  ) = __$$ApprovalInfoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'approval_id') String approvalId,
    @JsonKey(name: 'tool_name') String toolName,
    @JsonKey(name: 'execution_process_id') String executionProcessId,
    @JsonKey(name: 'is_question') bool isQuestion,
    String createdAt,
    String timeoutAt,
  });
}

/// @nodoc
class __$$ApprovalInfoImplCopyWithImpl<$Res>
    extends _$ApprovalInfoCopyWithImpl<$Res, _$ApprovalInfoImpl>
    implements _$$ApprovalInfoImplCopyWith<$Res> {
  __$$ApprovalInfoImplCopyWithImpl(
    _$ApprovalInfoImpl _value,
    $Res Function(_$ApprovalInfoImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of ApprovalInfo
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? approvalId = null,
    Object? toolName = null,
    Object? executionProcessId = null,
    Object? isQuestion = null,
    Object? createdAt = null,
    Object? timeoutAt = null,
  }) {
    return _then(
      _$ApprovalInfoImpl(
        approvalId:
            null == approvalId
                ? _value.approvalId
                : approvalId // ignore: cast_nullable_to_non_nullable
                    as String,
        toolName:
            null == toolName
                ? _value.toolName
                : toolName // ignore: cast_nullable_to_non_nullable
                    as String,
        executionProcessId:
            null == executionProcessId
                ? _value.executionProcessId
                : executionProcessId // ignore: cast_nullable_to_non_nullable
                    as String,
        isQuestion:
            null == isQuestion
                ? _value.isQuestion
                : isQuestion // ignore: cast_nullable_to_non_nullable
                    as bool,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
        timeoutAt:
            null == timeoutAt
                ? _value.timeoutAt
                : timeoutAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$ApprovalInfoImpl implements _ApprovalInfo {
  const _$ApprovalInfoImpl({
    @JsonKey(name: 'approval_id') required this.approvalId,
    @JsonKey(name: 'tool_name') required this.toolName,
    @JsonKey(name: 'execution_process_id') required this.executionProcessId,
    @JsonKey(name: 'is_question') required this.isQuestion,
    required this.createdAt,
    required this.timeoutAt,
  });

  factory _$ApprovalInfoImpl.fromJson(Map<String, dynamic> json) =>
      _$$ApprovalInfoImplFromJson(json);

  @override
  @JsonKey(name: 'approval_id')
  final String approvalId;
  @override
  @JsonKey(name: 'tool_name')
  final String toolName;
  @override
  @JsonKey(name: 'execution_process_id')
  final String executionProcessId;
  @override
  @JsonKey(name: 'is_question')
  final bool isQuestion;
  @override
  final String createdAt;
  @override
  final String timeoutAt;

  @override
  String toString() {
    return 'ApprovalInfo(approvalId: $approvalId, toolName: $toolName, executionProcessId: $executionProcessId, isQuestion: $isQuestion, createdAt: $createdAt, timeoutAt: $timeoutAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ApprovalInfoImpl &&
            (identical(other.approvalId, approvalId) ||
                other.approvalId == approvalId) &&
            (identical(other.toolName, toolName) ||
                other.toolName == toolName) &&
            (identical(other.executionProcessId, executionProcessId) ||
                other.executionProcessId == executionProcessId) &&
            (identical(other.isQuestion, isQuestion) ||
                other.isQuestion == isQuestion) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.timeoutAt, timeoutAt) ||
                other.timeoutAt == timeoutAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    approvalId,
    toolName,
    executionProcessId,
    isQuestion,
    createdAt,
    timeoutAt,
  );

  /// Create a copy of ApprovalInfo
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ApprovalInfoImplCopyWith<_$ApprovalInfoImpl> get copyWith =>
      __$$ApprovalInfoImplCopyWithImpl<_$ApprovalInfoImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ApprovalInfoImplToJson(this);
  }
}

abstract class _ApprovalInfo implements ApprovalInfo {
  const factory _ApprovalInfo({
    @JsonKey(name: 'approval_id') required final String approvalId,
    @JsonKey(name: 'tool_name') required final String toolName,
    @JsonKey(name: 'execution_process_id')
    required final String executionProcessId,
    @JsonKey(name: 'is_question') required final bool isQuestion,
    required final String createdAt,
    required final String timeoutAt,
  }) = _$ApprovalInfoImpl;

  factory _ApprovalInfo.fromJson(Map<String, dynamic> json) =
      _$ApprovalInfoImpl.fromJson;

  @override
  @JsonKey(name: 'approval_id')
  String get approvalId;
  @override
  @JsonKey(name: 'tool_name')
  String get toolName;
  @override
  @JsonKey(name: 'execution_process_id')
  String get executionProcessId;
  @override
  @JsonKey(name: 'is_question')
  bool get isQuestion;
  @override
  String get createdAt;
  @override
  String get timeoutAt;

  /// Create a copy of ApprovalInfo
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ApprovalInfoImplCopyWith<_$ApprovalInfoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

QuestionAnswer _$QuestionAnswerFromJson(Map<String, dynamic> json) {
  return _QuestionAnswer.fromJson(json);
}

/// @nodoc
mixin _$QuestionAnswer {
  String get question => throw _privateConstructorUsedError;
  List<String> get answer => throw _privateConstructorUsedError;

  /// Serializes this QuestionAnswer to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of QuestionAnswer
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $QuestionAnswerCopyWith<QuestionAnswer> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $QuestionAnswerCopyWith<$Res> {
  factory $QuestionAnswerCopyWith(
    QuestionAnswer value,
    $Res Function(QuestionAnswer) then,
  ) = _$QuestionAnswerCopyWithImpl<$Res, QuestionAnswer>;
  @useResult
  $Res call({String question, List<String> answer});
}

/// @nodoc
class _$QuestionAnswerCopyWithImpl<$Res, $Val extends QuestionAnswer>
    implements $QuestionAnswerCopyWith<$Res> {
  _$QuestionAnswerCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of QuestionAnswer
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? question = null, Object? answer = null}) {
    return _then(
      _value.copyWith(
            question:
                null == question
                    ? _value.question
                    : question // ignore: cast_nullable_to_non_nullable
                        as String,
            answer:
                null == answer
                    ? _value.answer
                    : answer // ignore: cast_nullable_to_non_nullable
                        as List<String>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$QuestionAnswerImplCopyWith<$Res>
    implements $QuestionAnswerCopyWith<$Res> {
  factory _$$QuestionAnswerImplCopyWith(
    _$QuestionAnswerImpl value,
    $Res Function(_$QuestionAnswerImpl) then,
  ) = __$$QuestionAnswerImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String question, List<String> answer});
}

/// @nodoc
class __$$QuestionAnswerImplCopyWithImpl<$Res>
    extends _$QuestionAnswerCopyWithImpl<$Res, _$QuestionAnswerImpl>
    implements _$$QuestionAnswerImplCopyWith<$Res> {
  __$$QuestionAnswerImplCopyWithImpl(
    _$QuestionAnswerImpl _value,
    $Res Function(_$QuestionAnswerImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of QuestionAnswer
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? question = null, Object? answer = null}) {
    return _then(
      _$QuestionAnswerImpl(
        question:
            null == question
                ? _value.question
                : question // ignore: cast_nullable_to_non_nullable
                    as String,
        answer:
            null == answer
                ? _value._answer
                : answer // ignore: cast_nullable_to_non_nullable
                    as List<String>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$QuestionAnswerImpl implements _QuestionAnswer {
  const _$QuestionAnswerImpl({
    required this.question,
    required final List<String> answer,
  }) : _answer = answer;

  factory _$QuestionAnswerImpl.fromJson(Map<String, dynamic> json) =>
      _$$QuestionAnswerImplFromJson(json);

  @override
  final String question;
  final List<String> _answer;
  @override
  List<String> get answer {
    if (_answer is EqualUnmodifiableListView) return _answer;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_answer);
  }

  @override
  String toString() {
    return 'QuestionAnswer(question: $question, answer: $answer)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$QuestionAnswerImpl &&
            (identical(other.question, question) ||
                other.question == question) &&
            const DeepCollectionEquality().equals(other._answer, _answer));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    question,
    const DeepCollectionEquality().hash(_answer),
  );

  /// Create a copy of QuestionAnswer
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$QuestionAnswerImplCopyWith<_$QuestionAnswerImpl> get copyWith =>
      __$$QuestionAnswerImplCopyWithImpl<_$QuestionAnswerImpl>(
        this,
        _$identity,
      );

  @override
  Map<String, dynamic> toJson() {
    return _$$QuestionAnswerImplToJson(this);
  }
}

abstract class _QuestionAnswer implements QuestionAnswer {
  const factory _QuestionAnswer({
    required final String question,
    required final List<String> answer,
  }) = _$QuestionAnswerImpl;

  factory _QuestionAnswer.fromJson(Map<String, dynamic> json) =
      _$QuestionAnswerImpl.fromJson;

  @override
  String get question;
  @override
  List<String> get answer;

  /// Create a copy of QuestionAnswer
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$QuestionAnswerImplCopyWith<_$QuestionAnswerImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
