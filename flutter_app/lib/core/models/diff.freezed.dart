// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'diff.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Diff _$DiffFromJson(Map<String, dynamic> json) {
  return _Diff.fromJson(json);
}

/// @nodoc
mixin _$Diff {
  DiffChangeKind get change => throw _privateConstructorUsedError;
  @JsonKey(name: 'oldPath')
  String? get oldPath => throw _privateConstructorUsedError;
  @JsonKey(name: 'newPath')
  String? get newPath => throw _privateConstructorUsedError;
  @JsonKey(name: 'oldContent')
  String? get oldContent => throw _privateConstructorUsedError;
  @JsonKey(name: 'newContent')
  String? get newContent => throw _privateConstructorUsedError;
  @JsonKey(name: 'contentOmitted')
  bool get contentOmitted => throw _privateConstructorUsedError;
  int? get additions => throw _privateConstructorUsedError;
  int? get deletions => throw _privateConstructorUsedError;
  @JsonKey(name: 'repoId')
  String? get repoId => throw _privateConstructorUsedError;

  /// Serializes this Diff to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Diff
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $DiffCopyWith<Diff> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DiffCopyWith<$Res> {
  factory $DiffCopyWith(Diff value, $Res Function(Diff) then) =
      _$DiffCopyWithImpl<$Res, Diff>;
  @useResult
  $Res call({
    DiffChangeKind change,
    @JsonKey(name: 'oldPath') String? oldPath,
    @JsonKey(name: 'newPath') String? newPath,
    @JsonKey(name: 'oldContent') String? oldContent,
    @JsonKey(name: 'newContent') String? newContent,
    @JsonKey(name: 'contentOmitted') bool contentOmitted,
    int? additions,
    int? deletions,
    @JsonKey(name: 'repoId') String? repoId,
  });
}

/// @nodoc
class _$DiffCopyWithImpl<$Res, $Val extends Diff>
    implements $DiffCopyWith<$Res> {
  _$DiffCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Diff
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? change = null,
    Object? oldPath = freezed,
    Object? newPath = freezed,
    Object? oldContent = freezed,
    Object? newContent = freezed,
    Object? contentOmitted = null,
    Object? additions = freezed,
    Object? deletions = freezed,
    Object? repoId = freezed,
  }) {
    return _then(
      _value.copyWith(
            change:
                null == change
                    ? _value.change
                    : change // ignore: cast_nullable_to_non_nullable
                        as DiffChangeKind,
            oldPath:
                freezed == oldPath
                    ? _value.oldPath
                    : oldPath // ignore: cast_nullable_to_non_nullable
                        as String?,
            newPath:
                freezed == newPath
                    ? _value.newPath
                    : newPath // ignore: cast_nullable_to_non_nullable
                        as String?,
            oldContent:
                freezed == oldContent
                    ? _value.oldContent
                    : oldContent // ignore: cast_nullable_to_non_nullable
                        as String?,
            newContent:
                freezed == newContent
                    ? _value.newContent
                    : newContent // ignore: cast_nullable_to_non_nullable
                        as String?,
            contentOmitted:
                null == contentOmitted
                    ? _value.contentOmitted
                    : contentOmitted // ignore: cast_nullable_to_non_nullable
                        as bool,
            additions:
                freezed == additions
                    ? _value.additions
                    : additions // ignore: cast_nullable_to_non_nullable
                        as int?,
            deletions:
                freezed == deletions
                    ? _value.deletions
                    : deletions // ignore: cast_nullable_to_non_nullable
                        as int?,
            repoId:
                freezed == repoId
                    ? _value.repoId
                    : repoId // ignore: cast_nullable_to_non_nullable
                        as String?,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$DiffImplCopyWith<$Res> implements $DiffCopyWith<$Res> {
  factory _$$DiffImplCopyWith(
    _$DiffImpl value,
    $Res Function(_$DiffImpl) then,
  ) = __$$DiffImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    DiffChangeKind change,
    @JsonKey(name: 'oldPath') String? oldPath,
    @JsonKey(name: 'newPath') String? newPath,
    @JsonKey(name: 'oldContent') String? oldContent,
    @JsonKey(name: 'newContent') String? newContent,
    @JsonKey(name: 'contentOmitted') bool contentOmitted,
    int? additions,
    int? deletions,
    @JsonKey(name: 'repoId') String? repoId,
  });
}

/// @nodoc
class __$$DiffImplCopyWithImpl<$Res>
    extends _$DiffCopyWithImpl<$Res, _$DiffImpl>
    implements _$$DiffImplCopyWith<$Res> {
  __$$DiffImplCopyWithImpl(_$DiffImpl _value, $Res Function(_$DiffImpl) _then)
    : super(_value, _then);

  /// Create a copy of Diff
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? change = null,
    Object? oldPath = freezed,
    Object? newPath = freezed,
    Object? oldContent = freezed,
    Object? newContent = freezed,
    Object? contentOmitted = null,
    Object? additions = freezed,
    Object? deletions = freezed,
    Object? repoId = freezed,
  }) {
    return _then(
      _$DiffImpl(
        change:
            null == change
                ? _value.change
                : change // ignore: cast_nullable_to_non_nullable
                    as DiffChangeKind,
        oldPath:
            freezed == oldPath
                ? _value.oldPath
                : oldPath // ignore: cast_nullable_to_non_nullable
                    as String?,
        newPath:
            freezed == newPath
                ? _value.newPath
                : newPath // ignore: cast_nullable_to_non_nullable
                    as String?,
        oldContent:
            freezed == oldContent
                ? _value.oldContent
                : oldContent // ignore: cast_nullable_to_non_nullable
                    as String?,
        newContent:
            freezed == newContent
                ? _value.newContent
                : newContent // ignore: cast_nullable_to_non_nullable
                    as String?,
        contentOmitted:
            null == contentOmitted
                ? _value.contentOmitted
                : contentOmitted // ignore: cast_nullable_to_non_nullable
                    as bool,
        additions:
            freezed == additions
                ? _value.additions
                : additions // ignore: cast_nullable_to_non_nullable
                    as int?,
        deletions:
            freezed == deletions
                ? _value.deletions
                : deletions // ignore: cast_nullable_to_non_nullable
                    as int?,
        repoId:
            freezed == repoId
                ? _value.repoId
                : repoId // ignore: cast_nullable_to_non_nullable
                    as String?,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$DiffImpl implements _Diff {
  const _$DiffImpl({
    required this.change,
    @JsonKey(name: 'oldPath') this.oldPath,
    @JsonKey(name: 'newPath') this.newPath,
    @JsonKey(name: 'oldContent') this.oldContent,
    @JsonKey(name: 'newContent') this.newContent,
    @JsonKey(name: 'contentOmitted') required this.contentOmitted,
    this.additions,
    this.deletions,
    @JsonKey(name: 'repoId') this.repoId,
  });

  factory _$DiffImpl.fromJson(Map<String, dynamic> json) =>
      _$$DiffImplFromJson(json);

  @override
  final DiffChangeKind change;
  @override
  @JsonKey(name: 'oldPath')
  final String? oldPath;
  @override
  @JsonKey(name: 'newPath')
  final String? newPath;
  @override
  @JsonKey(name: 'oldContent')
  final String? oldContent;
  @override
  @JsonKey(name: 'newContent')
  final String? newContent;
  @override
  @JsonKey(name: 'contentOmitted')
  final bool contentOmitted;
  @override
  final int? additions;
  @override
  final int? deletions;
  @override
  @JsonKey(name: 'repoId')
  final String? repoId;

  @override
  String toString() {
    return 'Diff(change: $change, oldPath: $oldPath, newPath: $newPath, oldContent: $oldContent, newContent: $newContent, contentOmitted: $contentOmitted, additions: $additions, deletions: $deletions, repoId: $repoId)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DiffImpl &&
            (identical(other.change, change) || other.change == change) &&
            (identical(other.oldPath, oldPath) || other.oldPath == oldPath) &&
            (identical(other.newPath, newPath) || other.newPath == newPath) &&
            (identical(other.oldContent, oldContent) ||
                other.oldContent == oldContent) &&
            (identical(other.newContent, newContent) ||
                other.newContent == newContent) &&
            (identical(other.contentOmitted, contentOmitted) ||
                other.contentOmitted == contentOmitted) &&
            (identical(other.additions, additions) ||
                other.additions == additions) &&
            (identical(other.deletions, deletions) ||
                other.deletions == deletions) &&
            (identical(other.repoId, repoId) || other.repoId == repoId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    change,
    oldPath,
    newPath,
    oldContent,
    newContent,
    contentOmitted,
    additions,
    deletions,
    repoId,
  );

  /// Create a copy of Diff
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$DiffImplCopyWith<_$DiffImpl> get copyWith =>
      __$$DiffImplCopyWithImpl<_$DiffImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$DiffImplToJson(this);
  }
}

abstract class _Diff implements Diff {
  const factory _Diff({
    required final DiffChangeKind change,
    @JsonKey(name: 'oldPath') final String? oldPath,
    @JsonKey(name: 'newPath') final String? newPath,
    @JsonKey(name: 'oldContent') final String? oldContent,
    @JsonKey(name: 'newContent') final String? newContent,
    @JsonKey(name: 'contentOmitted') required final bool contentOmitted,
    final int? additions,
    final int? deletions,
    @JsonKey(name: 'repoId') final String? repoId,
  }) = _$DiffImpl;

  factory _Diff.fromJson(Map<String, dynamic> json) = _$DiffImpl.fromJson;

  @override
  DiffChangeKind get change;
  @override
  @JsonKey(name: 'oldPath')
  String? get oldPath;
  @override
  @JsonKey(name: 'newPath')
  String? get newPath;
  @override
  @JsonKey(name: 'oldContent')
  String? get oldContent;
  @override
  @JsonKey(name: 'newContent')
  String? get newContent;
  @override
  @JsonKey(name: 'contentOmitted')
  bool get contentOmitted;
  @override
  int? get additions;
  @override
  int? get deletions;
  @override
  @JsonKey(name: 'repoId')
  String? get repoId;

  /// Create a copy of Diff
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$DiffImplCopyWith<_$DiffImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
