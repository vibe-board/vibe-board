// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'machine_status.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$MachineStatusImpl _$$MachineStatusImplFromJson(Map<String, dynamic> json) =>
    _$MachineStatusImpl(
      machineId: json['machine_id'] as String,
      hostname: json['hostname'] as String,
      platform: json['platform'] as String,
    );

Map<String, dynamic> _$$MachineStatusImplToJson(_$MachineStatusImpl instance) =>
    <String, dynamic>{
      'machine_id': instance.machineId,
      'hostname': instance.hostname,
      'platform': instance.platform,
    };
