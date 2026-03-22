import 'package:freezed_annotation/freezed_annotation.dart';

part 'machine_status.freezed.dart';
part 'machine_status.g.dart';

@freezed
sealed class MachineStatus with _$MachineStatus {
  const factory MachineStatus({
    @JsonKey(name: 'machine_id') required String machineId,
    required String hostname,
    required String platform,
  }) = _MachineStatus;

  factory MachineStatus.fromJson(Map<String, dynamic> json) =>
      _$MachineStatusFromJson(json);
}
