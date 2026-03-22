// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'image_ref.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

ImageMetadata _$ImageMetadataFromJson(Map<String, dynamic> json) {
  return _ImageMetadata.fromJson(json);
}

/// @nodoc
mixin _$ImageMetadata {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'task_id')
  String get taskId => throw _privateConstructorUsedError;
  String get filename => throw _privateConstructorUsedError;
  @JsonKey(name: 'content_type')
  String? get contentType => throw _privateConstructorUsedError;
  @JsonKey(name: 'file_size')
  int? get fileSize => throw _privateConstructorUsedError;
  @JsonKey(name: 'created_at')
  String get createdAt => throw _privateConstructorUsedError;

  /// Serializes this ImageMetadata to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ImageMetadata
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ImageMetadataCopyWith<ImageMetadata> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ImageMetadataCopyWith<$Res> {
  factory $ImageMetadataCopyWith(
    ImageMetadata value,
    $Res Function(ImageMetadata) then,
  ) = _$ImageMetadataCopyWithImpl<$Res, ImageMetadata>;
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'task_id') String taskId,
    String filename,
    @JsonKey(name: 'content_type') String? contentType,
    @JsonKey(name: 'file_size') int? fileSize,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class _$ImageMetadataCopyWithImpl<$Res, $Val extends ImageMetadata>
    implements $ImageMetadataCopyWith<$Res> {
  _$ImageMetadataCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ImageMetadata
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? taskId = null,
    Object? filename = null,
    Object? contentType = freezed,
    Object? fileSize = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _value.copyWith(
            id:
                null == id
                    ? _value.id
                    : id // ignore: cast_nullable_to_non_nullable
                        as String,
            taskId:
                null == taskId
                    ? _value.taskId
                    : taskId // ignore: cast_nullable_to_non_nullable
                        as String,
            filename:
                null == filename
                    ? _value.filename
                    : filename // ignore: cast_nullable_to_non_nullable
                        as String,
            contentType:
                freezed == contentType
                    ? _value.contentType
                    : contentType // ignore: cast_nullable_to_non_nullable
                        as String?,
            fileSize:
                freezed == fileSize
                    ? _value.fileSize
                    : fileSize // ignore: cast_nullable_to_non_nullable
                        as int?,
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
abstract class _$$ImageMetadataImplCopyWith<$Res>
    implements $ImageMetadataCopyWith<$Res> {
  factory _$$ImageMetadataImplCopyWith(
    _$ImageMetadataImpl value,
    $Res Function(_$ImageMetadataImpl) then,
  ) = __$$ImageMetadataImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    @JsonKey(name: 'task_id') String taskId,
    String filename,
    @JsonKey(name: 'content_type') String? contentType,
    @JsonKey(name: 'file_size') int? fileSize,
    @JsonKey(name: 'created_at') String createdAt,
  });
}

/// @nodoc
class __$$ImageMetadataImplCopyWithImpl<$Res>
    extends _$ImageMetadataCopyWithImpl<$Res, _$ImageMetadataImpl>
    implements _$$ImageMetadataImplCopyWith<$Res> {
  __$$ImageMetadataImplCopyWithImpl(
    _$ImageMetadataImpl _value,
    $Res Function(_$ImageMetadataImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of ImageMetadata
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? taskId = null,
    Object? filename = null,
    Object? contentType = freezed,
    Object? fileSize = freezed,
    Object? createdAt = null,
  }) {
    return _then(
      _$ImageMetadataImpl(
        id:
            null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                    as String,
        taskId:
            null == taskId
                ? _value.taskId
                : taskId // ignore: cast_nullable_to_non_nullable
                    as String,
        filename:
            null == filename
                ? _value.filename
                : filename // ignore: cast_nullable_to_non_nullable
                    as String,
        contentType:
            freezed == contentType
                ? _value.contentType
                : contentType // ignore: cast_nullable_to_non_nullable
                    as String?,
        fileSize:
            freezed == fileSize
                ? _value.fileSize
                : fileSize // ignore: cast_nullable_to_non_nullable
                    as int?,
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
class _$ImageMetadataImpl implements _ImageMetadata {
  const _$ImageMetadataImpl({
    required this.id,
    @JsonKey(name: 'task_id') required this.taskId,
    required this.filename,
    @JsonKey(name: 'content_type') this.contentType,
    @JsonKey(name: 'file_size') this.fileSize,
    @JsonKey(name: 'created_at') required this.createdAt,
  });

  factory _$ImageMetadataImpl.fromJson(Map<String, dynamic> json) =>
      _$$ImageMetadataImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(name: 'task_id')
  final String taskId;
  @override
  final String filename;
  @override
  @JsonKey(name: 'content_type')
  final String? contentType;
  @override
  @JsonKey(name: 'file_size')
  final int? fileSize;
  @override
  @JsonKey(name: 'created_at')
  final String createdAt;

  @override
  String toString() {
    return 'ImageMetadata(id: $id, taskId: $taskId, filename: $filename, contentType: $contentType, fileSize: $fileSize, createdAt: $createdAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ImageMetadataImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.taskId, taskId) || other.taskId == taskId) &&
            (identical(other.filename, filename) ||
                other.filename == filename) &&
            (identical(other.contentType, contentType) ||
                other.contentType == contentType) &&
            (identical(other.fileSize, fileSize) ||
                other.fileSize == fileSize) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    taskId,
    filename,
    contentType,
    fileSize,
    createdAt,
  );

  /// Create a copy of ImageMetadata
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ImageMetadataImplCopyWith<_$ImageMetadataImpl> get copyWith =>
      __$$ImageMetadataImplCopyWithImpl<_$ImageMetadataImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ImageMetadataImplToJson(this);
  }
}

abstract class _ImageMetadata implements ImageMetadata {
  const factory _ImageMetadata({
    required final String id,
    @JsonKey(name: 'task_id') required final String taskId,
    required final String filename,
    @JsonKey(name: 'content_type') final String? contentType,
    @JsonKey(name: 'file_size') final int? fileSize,
    @JsonKey(name: 'created_at') required final String createdAt,
  }) = _$ImageMetadataImpl;

  factory _ImageMetadata.fromJson(Map<String, dynamic> json) =
      _$ImageMetadataImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(name: 'task_id')
  String get taskId;
  @override
  String get filename;
  @override
  @JsonKey(name: 'content_type')
  String? get contentType;
  @override
  @JsonKey(name: 'file_size')
  int? get fileSize;
  @override
  @JsonKey(name: 'created_at')
  String get createdAt;

  /// Create a copy of ImageMetadata
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ImageMetadataImplCopyWith<_$ImageMetadataImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
