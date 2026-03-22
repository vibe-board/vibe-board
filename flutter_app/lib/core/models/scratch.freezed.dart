// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'scratch.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Scratch _$ScratchFromJson(Map<String, dynamic> json) {
  return _Scratch.fromJson(json);
}

/// @nodoc
mixin _$Scratch {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'scratch_type')
  String get scratchType => throw _privateConstructorUsedError;
  @JsonKey(name: 'reference_id')
  String get referenceId => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;
  @JsonKey(name: 'created_at')
  String get createdAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'updated_at')
  String get updatedAt => throw _privateConstructorUsedError;

  /// Serializes this Scratch to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Scratch
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ScratchCopyWith<Scratch> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ScratchCopyWith<$Res> {
  factory $ScratchCopyWith(Scratch value, $Res Function(Scratch) then) =
      _$ScratchCopyWithImpl<$Res, Scratch>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'scratch_type') String scratchType,
    @JsonKey(name: 'reference_id') String referenceId,
    String content,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class _$ScratchCopyWithImpl<$Res, $Val extends Scratch>
    implements $ScratchCopyWith<$Res> {
  _$ScratchCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Scratch
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? scratchType = null,
    Object? referenceId = null,
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
            scratchType:
                null == scratchType
                    ? _value.scratchType
                    : scratchType // ignore: cast_nullable_to_non_nullable
                        as String,
            referenceId:
                null == referenceId
                    ? _value.referenceId
                    : referenceId // ignore: cast_nullable_to_non_nullable
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
abstract class _$$ScratchImplCopyWith<$Res> implements $ScratchCopyWith<$Res> {
  factory _$$ScratchImplCopyWith(
    _$ScratchImpl value,
    $Res Function(_$ScratchImpl) then,
  ) = __$$ScratchImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'scratch_type') String scratchType,
    @JsonKey(name: 'reference_id') String referenceId,
    String content,
    @JsonKey(name: 'created_at') String createdAt,
    @JsonKey(name: 'updated_at') String updatedAt,
  });
}

/// @nodoc
class __$$ScratchImplCopyWithImpl<$Res>
    extends _$ScratchCopyWithImpl<$Res, _$ScratchImpl>
    implements _$$ScratchImplCopyWith<$Res> {
  __$$ScratchImplCopyWithImpl(
    _$ScratchImpl _value,
    $Res Function(_$ScratchImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Scratch
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? scratchType = null,
    Object? referenceId = null,
    Object? content = null,
    Object? createdAt = null,
    Object? updatedAt = null,
  }) {
    return _then(
      _$ScratchImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        scratchType:
            null == scratchType
                ? _value.scratchType
                : scratchType // ignore: cast_nullable_to_non_nullable
                    as String,
        referenceId:
            null == referenceId
                ? _value.referenceId
                : referenceId // ignore: cast_nullable_to_non_nullable
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
class _$ScratchImpl implements _Scratch {
  const _$ScratchImpl({
    required this.id,
    @JsonKey(name: 'scratch_type') required this.scratchType,
    @JsonKey(name: 'reference_id') required this.referenceId,
    required this.content,
    @JsonKey(name: 'created_at') required this.createdAt,
    @JsonKey(name: 'updated_at') required this.updatedAt,
  });

  factory _$ScratchImpl.fromJson(Map<String, dynamic> json) =>
      _$$ScratchImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'scratch_type')
  final String scratchType;
  @override
  @JsonKey(name: 'reference_id')
  final String referenceId;
  @override
  final String content;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;
  @override
  @JsonKey(name: 'updated_at')
  final String updatedAt;

  @override
  String toString() {
    return 'Scratch(id: $id, scratchType: $scratchType, referenceId: $referenceId, content: $content, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ScratchImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.scratchType, scratchType) ||
                other.scratchType == scratchType) &&
            (identical(other.referenceId, referenceId) ||
                other.referenceId == referenceId) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    scratchType,
    referenceId,
    content,
    createdAt,
    updatedAt,
  );

  /// Create a copy of Scratch
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ScratchImplCopyWith<_$ScratchImpl> get copyWith =>
      __$$ScratchImplCopyWithImpl<_$ScratchImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ScratchImplToJson(this);
  }
}

abstract class _Scratch implements Scratch {
  const factory _Scratch({
    required final String id,
    @JsonKey(name: 'scratch_type') required final String scratchType,
    @JsonKey(name: 'reference_id') required final String referenceId,
    required final String content,
    @JsonKey(name: 'created_at') required final String createdAt,
    @JsonKey(name: 'updated_at') required final String updatedAt,
  }) = _$ScratchImpl;

  factory _Scratch.fromJson(Map<String, dynamic> json) = _$ScratchImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'scratch_type')
  String get scratchType;
  @override
  @JsonKey(name: 'reference_id')
  String get referenceId;
  @override
  String get content;
  @override
  @JsonKey(name: 'created_at')
  String get createdAt;
  @override
  @JsonKey(name: 'updated_at')
  String get updatedAt;

  /// Create a copy of Scratch
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ScratchImplCopyWith<_$ScratchImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
