import 'package:freezed_annotation/freezed_annotation.dart';

part 'config.freezed.dart';
part 'config.g.dart';

@freezed
sealed class Config with _$Config {
  const factory Config({
    @JsonKey(name: 'config_version') required String configVersion,
    required String theme,
    @JsonKey(name: 'executor_profile')
    required Map<String, dynamic> executorProfile,
    @JsonKey(name: 'disclaimer_acknowledged')
    required bool disclaimerAcknowledged,
    @JsonKey(name: 'onboarding_acknowledged')
    required bool onboardingAcknowledged,
    @JsonKey(name: 'analytics_enabled') required bool analyticsEnabled,
    @JsonKey(name: 'workspace_dir') String? workspaceDir,
    required String language,
    @JsonKey(name: 'git_branch_prefix') required String gitBranchPrefix,
    @JsonKey(name: 'pr_auto_description_enabled')
    required bool prAutoDescriptionEnabled,
    @JsonKey(name: 'beta_workspaces') required bool betaWorkspaces,
    @JsonKey(name: 'commit_reminder_enabled') required bool commitReminderEnabled,
    @JsonKey(name: 'send_message_shortcut') required String sendMessageShortcut,
    @JsonKey(name: 'agent_order') required List<String> agentOrder,
    @JsonKey(name: 'project_order') required List<String> projectOrder,
    @JsonKey(name: 'agent_enabled') required List<String> agentEnabled,
    @JsonKey(name: 'commit_message_enabled') required bool commitMessageEnabled,
  }) = _Config;

  factory Config.fromJson(Map<String, dynamic> json) =>
      _$ConfigFromJson(json);
}
