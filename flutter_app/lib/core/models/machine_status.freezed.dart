// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'machine_status.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

MachineStatus _$MachineStatusFromJson(Map<String, dynamic> json) {
  return _MachineStatus.fromJson(json);
}

/// @nodoc
mixin _$MachineStatus {
  @JsonKey(name: 'machine_id')
  String get machineId => throw _privateConstructorUsedError;
  String get hostname => throw _privateConstructorUsedError;
  String get platform => throw _privateConstructorUsedError;

  /// Serializes this MachineStatus to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of MachineStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $MachineStatusCopyWith<MachineStatus> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $MachineStatusCopyWith<$Res> {
  factory $MachineStatusCopyWith(
    MachineStatus value,
    $Res Function(MachineStatus) then,
  ) = _$MachineStatusCopyWithImpl<$Res, MachineStatus>;
  @useResult
  $Res call({
    @JsonKey(name: 'machine_id') String machineId,
    String hostname,
    String platform,
  });
}

/// @nodoc
class _$MachineStatusCopyWithImpl<$Res, $Val extends MachineStatus>
    implements $MachineStatusCopyWith<$Res> {
  _$MachineStatusCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of MachineStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? machineId = null,
    Object? hostname = null,
    Object? platform = null,
  }) {
    return _then(
      _value.copyWith(
            machineId:
                null == machineId
                    ? _value.machineId
                    : machineId // ignore: cast_nullable_to_non_nullable
                        as String,
            hostname:
                null == hostname
                    ? _value.hostname
                    : hostname // ignore: cast_nullable_to_non_nullable
                        as String,
            platform:
                null == platform
                    ? _value.platform
                    : platform // ignore: cast_nullable_to_non_nullable
                        as String,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$MachineStatusImplCopyWith<$Res>
    implements $MachineStatusCopyWith<$Res> {
  factory _$$MachineStatusImplCopyWith(
    _$MachineStatusImpl value,
    $Res Function(_$MachineStatusImpl) then,
  ) = __$$MachineStatusImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'machine_id') String machineId,
    String hostname,
    String platform,
  });
}

/// @nodoc
class __$$MachineStatusImplCopyWithImpl<$Res>
    extends _$MachineStatusCopyWithImpl<$Res, _$MachineStatusImpl>
    implements _$$MachineStatusImplCopyWith<$Res> {
  __$$MachineStatusImplCopyWithImpl(
    _$MachineStatusImpl _value,
    $Res Function(_$MachineStatusImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of MachineStatus
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? machineId = null,
    Object? hostname = null,
    Object? platform = null,
  }) {
    return _then(
      _$MachineStatusImpl(
        machineId:
            null == machineId
                ? _value.machineId
                : machineId // ignore: cast_nullable_to_non_nullable
                    as String,
        hostname:
            null == hostname
                ? _value.hostname
                : hostname // ignore: cast_nullable_to_non_nullable
                    as String,
        platform:
            null == platform
                ? _value.platform
                : platform // ignore: cast_nullable_to_non_nullable
                    as String,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$MachineStatusImpl implements _MachineStatus {
  const _$MachineStatusImpl({
    @JsonKey(name: 'machine_id') required this.machineId,
    required this.hostname,
    required this.platform,
  });

  factory _$MachineStatusImpl.fromJson(Map<String, dynamic> json) =>
      _$$MachineStatusImplFromJson(json);

  @override
  @JsonKey(name: 'machine_id')
  final String machineId;
  @override
  final String hostname;
  @override
  final String platform;

  @override
  String toString() {
    return 'MachineStatus(machineId: $machineId, hostname: $hostname, platform: $platform)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$MachineStatusImpl &&
            (identical(other.machineId, machineId) ||
                other.machineId == machineId) &&
            (identical(other.hostname, hostname) ||
                other.hostname == hostname) &&
            (identical(other.platform, platform) ||
                other.platform == platform));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, machineId, hostname, platform);

  /// Create a copy of MachineStatus
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$MachineStatusImplCopyWith<_$MachineStatusImpl> get copyWith =>
      __$$MachineStatusImplCopyWithImpl<_$MachineStatusImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$MachineStatusImplToJson(this);
  }
}

abstract class _MachineStatus implements MachineStatus {
  const factory _MachineStatus({
    @JsonKey(name: 'machine_id') required final String machineId,
    required final String hostname,
    required final String platform,
  }) = _$MachineStatusImpl;

  factory _MachineStatus.fromJson(Map<String, dynamic> json) =
      _$MachineStatusImpl.fromJson;

  @override
  @JsonKey(name: 'machine_id')
  String get machineId;
  @override
  String get hostname;
  @override
  String get platform;

  /// Create a copy of MachineStatus
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$MachineStatusImplCopyWith<_$MachineStatusImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
