// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'tag.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Tag _$TagFromJson(Map<String, dynamic> json) {
  return _Tag.fromJson(json);
}

/// @nodoc
mixin _$Tag {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'tag_name')
  String get tagName => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;
  String get createdAt => throw _privateConstructorUsedError;
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Tag to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Tag
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $TagCopyWith<Tag> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $TagCopyWith<$Res> {
  factory $TagCopyWith(Tag value, $Res Function(Tag) then) =
      _$TagCopyWithImpl<$Res, Tag>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'tag_name') String tagName,
    String content,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class _$TagCopyWithImpl<$Res, $Val extends Tag> implements $TagCopyWith<$Res> {
  _$TagCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Tag
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tagName = null,
    Object? content = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            tagName:
                null == tagName
                    ? _value.tagName
                    : tagName // ignore: cast_nullable_to_non_nullable
                        as String,
            content:
                null == content
                    ? _value.content
                    : content // ignore: cast_nullable_to_non_nullable
                        as String,
            createdAt:
                null == createdAt
                    ? _value.createdAt
                    : createdAt // ignore: cast_nullable_to_non_nullable
                        as String,
            updatedAt:
                null == updatedAt
                    ? _value.updatedAt
                    : updatedAt // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$TagImplCopyWith<$Res> implements $TagCopyWith<$Res> {
  factory _$$TagImplCopyWith(_$TagImpl value, $Res Function(_$TagImpl) then) =
      __$$TagImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'tag_name') String tagName,
    String content,
    String createdAt,
    String updatedAt,
  });
}

/// @nodoc
class __$$TagImplCopyWithImpl<$Res> extends _$TagCopyWithImpl<$Res, _$TagImpl>
    implements _$$TagImplCopyWith<$Res> {
  __$$TagImplCopyWithImpl(_$TagImpl _value, $Res Function(_$TagImpl) _then)
    : super(_value, _then);

  /// Create a copy of Tag
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? tagName = null,
    Object? content = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$TagImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        tagName:
            null == tagName
                ? _value.tagName
                : tagName // ignore: cast_nullable_to_non_nullable
                    as String,
        content:
            null == content
                ? _value.content
                : content // ignore: cast_nullable_to_non_nullable
                    as String,
        createdAt:
            null == createdAt
                ? _value.createdAt
                : createdAt // ignore: cast_nullable_to_non_nullable
                    as String,
        updatedAt:
            null == updatedAt
                ? _value.updatedAt
                : updatedAt // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$TagImpl implements _Tag {
  const _$TagImpl({
    required this.id,
    @JsonKey(name: 'tag_name') required this.tagName,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  factory _$TagImpl.fromJson(Map<String, dynamic> json) =>
      _$$TagImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'tag_name')
  final String tagName;
  @override
  final String content;
  @override
  final String createdAt;
  @override
  final String updatedAt;

  @override
  String toString() {
    return 'Tag(id: $id, tagName: $tagName, content: $content, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$TagImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.tagName, tagName) || other.tagName == tagName) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, tagName, content, createdAt, updatedAt);

  /// Create a copy of Tag
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$TagImplCopyWith<_$TagImpl> get copyWith =>
      __$$TagImplCopyWithImpl<_$TagImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$TagImplToJson(this);
  }
}

abstract class _Tag implements Tag {
  const factory _Tag({
    required final String id,
    @JsonKey(name: 'tag_name') required final String tagName,
    required final String content,
    required final String createdAt,
    required final String updatedAt,
  }) = _$TagImpl;

  factory _Tag.fromJson(Map<String, dynamic> json) = _$TagImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'tag_name')
  String get tagName;
  @override
  String get content;
  @override
  String get createdAt;
  @override
  String get updatedAt;

  /// Create a copy of Tag
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$TagImplCopyWith<_$TagImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

CreateTag _$CreateTagFromJson(Map<String, dynamic> json) {
  return _CreateTag.fromJson(json);
}

/// @nodoc
mixin _$CreateTag {
  @JsonKey(name: 'tag_name')
  String get tagName => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;

  /// Serializes this CreateTag to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of CreateTag
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $CreateTagCopyWith<CreateTag> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CreateTagCopyWith<$Res> {
  factory $CreateTagCopyWith(CreateTag value, $Res Function(CreateTag) then) =
      _$CreateTagCopyWithImpl<$Res, CreateTag>;
  @useResult
  $Res call({@JsonKey(name: 'tag_name') String tagName, String content});
}

/// @nodoc
class _$CreateTagCopyWithImpl<$Res, $Val extends CreateTag>
    implements $CreateTagCopyWith<$Res> {
  _$CreateTagCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of CreateTag
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? tagName = null, Object? content = null}) {
    return _then(
      _value.copyWith(
            tagName:
                null == tagName
                    ? _value.tagName
                    : tagName // ignore: cast_nullable_to_non_nullable
                        as String,
            content:
                null == content
                    ? _value.content
                    : content // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$CreateTagImplCopyWith<$Res>
    implements $CreateTagCopyWith<$Res> {
  factory _$$CreateTagImplCopyWith(
    _$CreateTagImpl value,
    $Res Function(_$CreateTagImpl) then,
  ) = __$$CreateTagImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({@JsonKey(name: 'tag_name') String tagName, String content});
}

/// @nodoc
class __$$CreateTagImplCopyWithImpl<$Res>
    extends _$CreateTagCopyWithImpl<$Res, _$CreateTagImpl>
    implements _$$CreateTagImplCopyWith<$Res> {
  __$$CreateTagImplCopyWithImpl(
    _$CreateTagImpl _value,
    $Res Function(_$CreateTagImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of CreateTag
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? tagName = null, Object? content = null}) {
    return _then(
      _$CreateTagImpl(
        tagName:
            null == tagName
                ? _value.tagName
                : tagName // ignore: cast_nullable_to_non_nullable
                    as String,
        content:
            null == content
                ? _value.content
                : content // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$CreateTagImpl implements _CreateTag {
  const _$CreateTagImpl({
    @JsonKey(name: 'tag_name') required this.tagName,
    required this.content,
  });

  factory _$CreateTagImpl.fromJson(Map<String, dynamic> json) =>
      _$$CreateTagImplFromJson(json);

  @override
  @JsonKey(name: 'tag_name')
  final String tagName;
  @override
  final String content;

  @override
  String toString() {
    return 'CreateTag(tagName: $tagName, content: $content)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CreateTagImpl &&
            (identical(other.tagName, tagName) || other.tagName == tagName) &&
            (identical(other.content, content) || other.content == content));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, tagName, content);

  /// Create a copy of CreateTag
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$CreateTagImplCopyWith<_$CreateTagImpl> get copyWith =>
      __$$CreateTagImplCopyWithImpl<_$CreateTagImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CreateTagImplToJson(this);
  }
}

abstract class _CreateTag implements CreateTag {
  const factory _CreateTag({
    @JsonKey(name: 'tag_name') required final String tagName,
    required final String content,
  }) = _$CreateTagImpl;

  factory _CreateTag.fromJson(Map<String, dynamic> json) =
      _$CreateTagImpl.fromJson;

  @override
  @JsonKey(name: 'tag_name')
  String get tagName;
  @override
  String get content;

  /// Create a copy of CreateTag
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$CreateTagImplCopyWith<_$CreateTagImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
