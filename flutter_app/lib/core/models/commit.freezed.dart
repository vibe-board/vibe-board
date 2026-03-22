// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'commit.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Commit _$CommitFromJson(Map<String, dynamic> json) {
  return _Commit.fromJson(json);
}

/// @nodoc
mixin _$Commit {
  String get sha => throw _privateConstructorUsedError;
  String get message => throw _privateConstructorUsedError;
  String get author => throw _privateConstructorUsedError;
  @JsonKey(name: 'author_email')
  String? get authorEmail => throw _privateConstructorUsedError;
  String get date => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_head')
  bool? get isHead => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_merge')
  bool? get isMerge => throw _privateConstructorUsedError;

  /// Serializes this Commit to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Commit
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $CommitCopyWith<Commit> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CommitCopyWith<$Res> {
  factory $CommitCopyWith(Commit value, $Res Function(Commit) then) =
      _$CommitCopyWithImpl<$Res, Commit>;
  @useResult
  $Res call({
    String sha,
    String message,
    String author,
    @JsonKey(name: 'author_email') String? authorEmail,
    String date,
    @JsonKey(name: 'is_head') bool? isHead,
    @JsonKey(name: 'is_merge') bool? isMerge,
  });
}

/// @nodoc
class _$CommitCopyWithImpl<$Res, $Val extends Commit>
    implements $CommitCopyWith<$Res> {
  _$CommitCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Commit
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? sha = null,
    Object? message = null,
    Object? author = null,
    Object? authorEmail = freezed,
    Object? date = null,
    Object? isHead = freezed,
    Object? isMerge = freezed,
  }) {
    return _then(
      _value.copyWith(
            sha:
                null == sha
                    ? _value.sha
                    : sha // ignore: cast_nullable_to_non_nullable
                        as String,
            message:
                null == message
                    ? _value.message
                    : message // ignore: cast_nullable_to_non_nullable
                        as String,
            author:
                null == author
                    ? _value.author
                    : author // ignore: cast_nullable_to_non_nullable
                        as String,
            authorEmail:
                freezed == authorEmail
                    ? _value.authorEmail
                    : authorEmail // ignore: cast_nullable_to_non_nullable
                        as String?,
            date:
                null == date
                    ? _value.date
                    : date // ignore: cast_nullable_to_non_nullable
                        as String,
            isHead:
                freezed == isHead
                    ? _value.isHead
                    : isHead // ignore: cast_nullable_to_non_nullable
                        as bool?,
            isMerge:
                freezed == isMerge
                    ? _value.isMerge
                    : isMerge // ignore: cast_nullable_to_non_nullable
                        as bool?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$CommitImplCopyWith<$Res> implements $CommitCopyWith<$Res> {
  factory _$$CommitImplCopyWith(
    _$CommitImpl value,
    $Res Function(_$CommitImpl) then,
  ) = __$$CommitImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String sha,
    String message,
    String author,
    @JsonKey(name: 'author_email') String? authorEmail,
    String date,
    @JsonKey(name: 'is_head') bool? isHead,
    @JsonKey(name: 'is_merge') bool? isMerge,
  });
}

/// @nodoc
class __$$CommitImplCopyWithImpl<$Res>
    extends _$CommitCopyWithImpl<$Res, _$CommitImpl>
    implements _$$CommitImplCopyWith<$Res> {
  __$$CommitImplCopyWithImpl(
    _$CommitImpl _value,
    $Res Function(_$CommitImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Commit
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? sha = null,
    Object? message = null,
    Object? author = null,
    Object? authorEmail = freezed,
    Object? date = null,
    Object? isHead = freezed,
    Object? isMerge = freezed,
  }) {
    return _then(
      _$CommitImpl(
        sha:
            null == sha
                ? _value.sha
                : sha // ignore: cast_nullable_to_non_nullable
                    as String,
        message:
            null == message
                ? _value.message
                : message // ignore: cast_nullable_to_non_nullable
                    as String,
        author:
            null == author
                ? _value.author
                : author // ignore: cast_nullable_to_non_nullable
                    as String,
        authorEmail:
            freezed == authorEmail
                ? _value.authorEmail
                : authorEmail // ignore: cast_nullable_to_non_nullable
                    as String?,
        date:
            null == date
                ? _value.date
                : date // ignore: cast_nullable_to_non_nullable
                    as String,
        isHead:
            freezed == isHead
                ? _value.isHead
                : isHead // ignore: cast_nullable_to_non_nullable
                    as bool?,
        isMerge:
            freezed == isMerge
                ? _value.isMerge
                : isMerge // ignore: cast_nullable_to_non_nullable
                    as bool?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$CommitImpl implements _Commit {
  const _$CommitImpl({
    required this.sha,
    required this.message,
    required this.author,
    @JsonKey(name: 'author_email') this.authorEmail,
    required this.date,
    @JsonKey(name: 'is_head') this.isHead,
    @JsonKey(name: 'is_merge') this.isMerge,
  });

  factory _$CommitImpl.fromJson(Map<String, dynamic> json) =>
      _$$CommitImplFromJson(json);

  @override
  final String sha;
  @override
  final String message;
  @override
  final String author;
  @override
  @JsonKey(name: 'author_email')
  final String? authorEmail;
  @override
  final String date;
  @override
  @JsonKey(name: 'is_head')
  final bool? isHead;
  @override
  @JsonKey(name: 'is_merge')
  final bool? isMerge;

  @override
  String toString() {
    return 'Commit(sha: $sha, message: $message, author: $author, authorEmail: $authorEmail, date: $date, isHead: $isHead, isMerge: $isMerge)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CommitImpl &&
            (identical(other.sha, sha) || other.sha == sha) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.author, author) || other.author == author) &&
            (identical(other.authorEmail, authorEmail) ||
                other.authorEmail == authorEmail) &&
            (identical(other.date, date) || other.date == date) &&
            (identical(other.isHead, isHead) || other.isHead == isHead) &&
            (identical(other.isMerge, isMerge) || other.isMerge == isMerge));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    sha,
    message,
    author,
    authorEmail,
    date,
    isHead,
    isMerge,
  );

  /// Create a copy of Commit
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$CommitImplCopyWith<_$CommitImpl> get copyWith =>
      __$$CommitImplCopyWithImpl<_$CommitImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CommitImplToJson(this);
  }
}

abstract class _Commit implements Commit {
  const factory _Commit({
    required final String sha,
    required final String message,
    required final String author,
    @JsonKey(name: 'author_email') final String? authorEmail,
    required final String date,
    @JsonKey(name: 'is_head') final bool? isHead,
    @JsonKey(name: 'is_merge') final bool? isMerge,
  }) = _$CommitImpl;

  factory _Commit.fromJson(Map<String, dynamic> json) = _$CommitImpl.fromJson;

  @override
  String get sha;
  @override
  String get message;
  @override
  String get author;
  @override
  @JsonKey(name: 'author_email')
  String? get authorEmail;
  @override
  String get date;
  @override
  @JsonKey(name: 'is_head')
  bool? get isHead;
  @override
  @JsonKey(name: 'is_merge')
  bool? get isMerge;

  /// Create a copy of Commit
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$CommitImplCopyWith<_$CommitImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
