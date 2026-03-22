// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ConfigImpl _$$ConfigImplFromJson(Map<String, dynamic> json) => _$ConfigImpl(
  configVersion: json['config_version'] as String,
  theme: json['theme'] as String,
  executorProfile: json['executor_profile'] as Map<String, dynamic>,
  disclaimerAcknowledged: json['disclaimer_acknowledged'] as bool,
  onboardingAcknowledged: json['onboarding_acknowledged'] as bool,
  analyticsEnabled: json['analytics_enabled'] as bool,
  workspaceDir: json['workspace_dir'] as String?,
  language: json['language'] as String,
  gitBranchPrefix: json['git_branch_prefix'] as String,
  prAutoDescriptionEnabled: json['pr_auto_description_enabled'] as bool,
  betaWorkspaces: json['beta_workspaces'] as bool,
  commitReminderEnabled: json['commit_reminder_enabled'] as bool,
  sendMessageShortcut: json['send_message_shortcut'] as String,
  agentOrder:
      (json['agent_order'] as List<dynamic>).map((e) => e as String).toList(),
  projectOrder:
      (json['project_order'] as List<dynamic>).map((e) => e as String).toList(),
  agentEnabled:
      (json['agent_enabled'] as List<dynamic>).map((e) => e as String).toList(),
  commitMessageEnabled: json['commit_message_enabled'] as bool,
);

Map<String, dynamic> _$$ConfigImplToJson(_$ConfigImpl instance) =>
    <String, dynamic>{
      'config_version': instance.configVersion,
      'theme': instance.theme,
      'executor_profile': instance.executorProfile,
      'disclaimer_acknowledged': instance.disclaimerAcknowledged,
      'onboarding_acknowledged': instance.onboardingAcknowledged,
      'analytics_enabled': instance.analyticsEnabled,
      'workspace_dir': instance.workspaceDir,
      'language': instance.language,
      'git_branch_prefix': instance.gitBranchPrefix,
      'pr_auto_description_enabled': instance.prAutoDescriptionEnabled,
      'beta_workspaces': instance.betaWorkspaces,
      'commit_reminder_enabled': instance.commitReminderEnabled,
      'send_message_shortcut': instance.sendMessageShortcut,
      'agent_order': instance.agentOrder,
      'project_order': instance.projectOrder,
      'agent_enabled': instance.agentEnabled,
      'commit_message_enabled': instance.commitMessageEnabled,
    };
