// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Config _$ConfigFromJson(Map<String, dynamic> json) {
  return _Config.fromJson(json);
}

/// @nodoc
mixin _$Config {
  @JsonKey(name: 'config_version')
  String get configVersion => throw _privateConstructorUsedError;
  String get theme => throw _privateConstructorUsedError;
  @JsonKey(name: 'executor_profile')
  Map<String, dynamic> get executorProfile =>
      throw _privateConstructorUsedError;
  @JsonKey(name: 'disclaimer_acknowledged')
  bool get disclaimerAcknowledged => throw _privateConstructorUsedError;
  @JsonKey(name: 'onboarding_acknowledged')
  bool get onboardingAcknowledged => throw _privateConstructorUsedError;
  @JsonKey(name: 'analytics_enabled')
  bool get analyticsEnabled => throw _privateConstructorUsedError;
  @JsonKey(name: 'workspace_dir')
  String? get workspaceDir => throw _privateConstructorUsedError;
  String get language => throw _privateConstructorUsedError;
  @JsonKey(name: 'git_branch_prefix')
  String get gitBranchPrefix => throw _privateConstructorUsedError;
  @JsonKey(name: 'pr_auto_description_enabled')
  bool get prAutoDescriptionEnabled => throw _privateConstructorUsedError;
  @JsonKey(name: 'beta_workspaces')
  bool get betaWorkspaces => throw _privateConstructorUsedError;
  @JsonKey(name: 'commit_reminder_enabled')
  bool get commitReminderEnabled => throw _privateConstructorUsedError;
  @JsonKey(name: 'send_message_shortcut')
  String get sendMessageShortcut => throw _privateConstructorUsedError;
  @JsonKey(name: 'agent_order')
  List<String> get agentOrder => throw _privateConstructorUsedError;
  @JsonKey(name: 'project_order')
  List<String> get projectOrder => throw _privateConstructorUsedError;
  @JsonKey(name: 'agent_enabled')
  List<String> get agentEnabled => throw _privateConstructorUsedError;
  @JsonKey(name: 'commit_message_enabled')
  bool get commitMessageEnabled => throw _privateConstructorUsedError;

  /// Serializes this Config to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Config
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ConfigCopyWith<Config> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ConfigCopyWith<$Res> {
  factory $ConfigCopyWith(Config value, $Res Function(Config) then) =
      _$ConfigCopyWithImpl<$Res, Config>;
  @useResult
  $Res call({
    @JsonKey(name: 'config_version') String configVersion,
    String theme,
    @JsonKey(name: 'executor_profile') Map<String, dynamic> executorProfile,
    @JsonKey(name: 'disclaimer_acknowledged') bool disclaimerAcknowledged,
    @JsonKey(name: 'onboarding_acknowledged') bool onboardingAcknowledged,
    @JsonKey(name: 'analytics_enabled') bool analyticsEnabled,
    @JsonKey(name: 'workspace_dir') String? workspaceDir,
    String language,
    @JsonKey(name: 'git_branch_prefix') String gitBranchPrefix,
    @JsonKey(name: 'pr_auto_description_enabled') bool prAutoDescriptionEnabled,
    @JsonKey(name: 'beta_workspaces') bool betaWorkspaces,
    @JsonKey(name: 'commit_reminder_enabled') bool commitReminderEnabled,
    @JsonKey(name: 'send_message_shortcut') String sendMessageShortcut,
    @JsonKey(name: 'agent_order') List<String> agentOrder,
    @JsonKey(name: 'project_order') List<String> projectOrder,
    @JsonKey(name: 'agent_enabled') List<String> agentEnabled,
    @JsonKey(name: 'commit_message_enabled') bool commitMessageEnabled,
  });
}

/// @nodoc
class _$ConfigCopyWithImpl<$Res, $Val extends Config>
    implements $ConfigCopyWith<$Res> {
  _$ConfigCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Config
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? configVersion = null,
    Object? theme = null,
    Object? executorProfile = null,
    Object? disclaimerAcknowledged = null,
    Object? onboardingAcknowledged = null,
    Object? analyticsEnabled = null,
    Object? workspaceDir = freezed,
    Object? language = null,
    Object? gitBranchPrefix = null,
    Object? prAutoDescriptionEnabled = null,
    Object? betaWorkspaces = null,
    Object? commitReminderEnabled = null,
    Object? sendMessageShortcut = null,
    Object? agentOrder = null,
    Object? projectOrder = null,
    Object? agentEnabled = null,
    Object? commitMessageEnabled = null,
  }) {
    return _then(
      _value.copyWith(
            configVersion:
                null == configVersion
                    ? _value.configVersion
                    : configVersion // ignore: cast_nullable_to_non_nullable
                        as String,
            theme:
                null == theme
                    ? _value.theme
                    : theme // ignore: cast_nullable_to_non_nullable
                        as String,
            executorProfile:
                null == executorProfile
                    ? _value.executorProfile
                    : executorProfile // ignore: cast_nullable_to_non_nullable
                        as Map<String, dynamic>,
            disclaimerAcknowledged:
                null == disclaimerAcknowledged
                    ? _value.disclaimerAcknowledged
                    : disclaimerAcknowledged // ignore: cast_nullable_to_non_nullable
                        as bool,
            onboardingAcknowledged:
                null == onboardingAcknowledged
                    ? _value.onboardingAcknowledged
                    : onboardingAcknowledged // ignore: cast_nullable_to_non_nullable
                        as bool,
            analyticsEnabled:
                null == analyticsEnabled
                    ? _value.analyticsEnabled
                    : analyticsEnabled // ignore: cast_nullable_to_non_nullable
                        as bool,
            workspaceDir:
                freezed == workspaceDir
                    ? _value.workspaceDir
                    : workspaceDir // ignore: cast_nullable_to_non_nullable
                        as String?,
            language:
                null == language
                    ? _value.language
                    : language // ignore: cast_nullable_to_non_nullable
                        as String,
            gitBranchPrefix:
                null == gitBranchPrefix
                    ? _value.gitBranchPrefix
                    : gitBranchPrefix // ignore: cast_nullable_to_non_nullable
                        as String,
            prAutoDescriptionEnabled:
                null == prAutoDescriptionEnabled
                    ? _value.prAutoDescriptionEnabled
                    : prAutoDescriptionEnabled // ignore: cast_nullable_to_non_nullable
                        as bool,
            betaWorkspaces:
                null == betaWorkspaces
                    ? _value.betaWorkspaces
                    : betaWorkspaces // ignore: cast_nullable_to_non_nullable
                        as bool,
            commitReminderEnabled:
                null == commitReminderEnabled
                    ? _value.commitReminderEnabled
                    : commitReminderEnabled // ignore: cast_nullable_to_non_nullable
                        as bool,
            sendMessageShortcut:
                null == sendMessageShortcut
                    ? _value.sendMessageShortcut
                    : sendMessageShortcut // ignore: cast_nullable_to_non_nullable
                        as String,
            agentOrder:
                null == agentOrder
                    ? _value.agentOrder
                    : agentOrder // ignore: cast_nullable_to_non_nullable
                        as List<String>,
            projectOrder:
                null == projectOrder
                    ? _value.projectOrder
                    : projectOrder // ignore: cast_nullable_to_non_nullable
                        as List<String>,
            agentEnabled:
                null == agentEnabled
                    ? _value.agentEnabled
                    : agentEnabled // ignore: cast_nullable_to_non_nullable
                        as List<String>,
            commitMessageEnabled:
                null == commitMessageEnabled
                    ? _value.commitMessageEnabled
                    : commitMessageEnabled // ignore: cast_nullable_to_non_nullable
                        as bool,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$ConfigImplCopyWith<$Res> implements $ConfigCopyWith<$Res> {
  factory _$$ConfigImplCopyWith(
    _$ConfigImpl value,
    $Res Function(_$ConfigImpl) then,
  ) = __$$ConfigImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    @JsonKey(name: 'config_version') String configVersion,
    String theme,
    @JsonKey(name: 'executor_profile') Map<String, dynamic> executorProfile,
    @JsonKey(name: 'disclaimer_acknowledged') bool disclaimerAcknowledged,
    @JsonKey(name: 'onboarding_acknowledged') bool onboardingAcknowledged,
    @JsonKey(name: 'analytics_enabled') bool analyticsEnabled,
    @JsonKey(name: 'workspace_dir') String? workspaceDir,
    String language,
    @JsonKey(name: 'git_branch_prefix') String gitBranchPrefix,
    @JsonKey(name: 'pr_auto_description_enabled') bool prAutoDescriptionEnabled,
    @JsonKey(name: 'beta_workspaces') bool betaWorkspaces,
    @JsonKey(name: 'commit_reminder_enabled') bool commitReminderEnabled,
    @JsonKey(name: 'send_message_shortcut') String sendMessageShortcut,
    @JsonKey(name: 'agent_order') List<String> agentOrder,
    @JsonKey(name: 'project_order') List<String> projectOrder,
    @JsonKey(name: 'agent_enabled') List<String> agentEnabled,
    @JsonKey(name: 'commit_message_enabled') bool commitMessageEnabled,
  });
}

/// @nodoc
class __$$ConfigImplCopyWithImpl<$Res>
    extends _$ConfigCopyWithImpl<$Res, _$ConfigImpl>
    implements _$$ConfigImplCopyWith<$Res> {
  __$$ConfigImplCopyWithImpl(
    _$ConfigImpl _value,
    $Res Function(_$ConfigImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Config
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? configVersion = null,
    Object? theme = null,
    Object? executorProfile = null,
    Object? disclaimerAcknowledged = null,
    Object? onboardingAcknowledged = null,
    Object? analyticsEnabled = null,
    Object? workspaceDir = freezed,
    Object? language = null,
    Object? gitBranchPrefix = null,
    Object? prAutoDescriptionEnabled = null,
    Object? betaWorkspaces = null,
    Object? commitReminderEnabled = null,
    Object? sendMessageShortcut = null,
    Object? agentOrder = null,
    Object? projectOrder = null,
    Object? agentEnabled = null,
    Object? commitMessageEnabled = null,
  }) {
    return _then(
      _$ConfigImpl(
        configVersion:
            null == configVersion
                ? _value.configVersion
                : configVersion // ignore: cast_nullable_to_non_nullable
                    as String,
        theme:
            null == theme
                ? _value.theme
                : theme // ignore: cast_nullable_to_non_nullable
                    as String,
        executorProfile:
            null == executorProfile
                ? _value._executorProfile
                : executorProfile // ignore: cast_nullable_to_non_nullable
                    as Map<String, dynamic>,
        disclaimerAcknowledged:
            null == disclaimerAcknowledged
                ? _value.disclaimerAcknowledged
                : disclaimerAcknowledged // ignore: cast_nullable_to_non_nullable
                    as bool,
        onboardingAcknowledged:
            null == onboardingAcknowledged
                ? _value.onboardingAcknowledged
                : onboardingAcknowledged // ignore: cast_nullable_to_non_nullable
                    as bool,
        analyticsEnabled:
            null == analyticsEnabled
                ? _value.analyticsEnabled
                : analyticsEnabled // ignore: cast_nullable_to_non_nullable
                    as bool,
        workspaceDir:
            freezed == workspaceDir
                ? _value.workspaceDir
                : workspaceDir // ignore: cast_nullable_to_non_nullable
                    as String?,
        language:
            null == language
                ? _value.language
                : language // ignore: cast_nullable_to_non_nullable
                    as String,
        gitBranchPrefix:
            null == gitBranchPrefix
                ? _value.gitBranchPrefix
                : gitBranchPrefix // ignore: cast_nullable_to_non_nullable
                    as String,
        prAutoDescriptionEnabled:
            null == prAutoDescriptionEnabled
                ? _value.prAutoDescriptionEnabled
                : prAutoDescriptionEnabled // ignore: cast_nullable_to_non_nullable
                    as bool,
        betaWorkspaces:
            null == betaWorkspaces
                ? _value.betaWorkspaces
                : betaWorkspaces // ignore: cast_nullable_to_non_nullable
                    as bool,
        commitReminderEnabled:
            null == commitReminderEnabled
                ? _value.commitReminderEnabled
                : commitReminderEnabled // ignore: cast_nullable_to_non_nullable
                    as bool,
        sendMessageShortcut:
            null == sendMessageShortcut
                ? _value.sendMessageShortcut
                : sendMessageShortcut // ignore: cast_nullable_to_non_nullable
                    as String,
        agentOrder:
            null == agentOrder
                ? _value._agentOrder
                : agentOrder // ignore: cast_nullable_to_non_nullable
                    as List<String>,
        projectOrder:
            null == projectOrder
                ? _value._projectOrder
                : projectOrder // ignore: cast_nullable_to_non_nullable
                    as List<String>,
        agentEnabled:
            null == agentEnabled
                ? _value._agentEnabled
                : agentEnabled // ignore: cast_nullable_to_non_nullable
                    as List<String>,
        commitMessageEnabled:
            null == commitMessageEnabled
                ? _value.commitMessageEnabled
                : commitMessageEnabled // ignore: cast_nullable_to_non_nullable
                    as bool,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$ConfigImpl implements _Config {
  const _$ConfigImpl({
    @JsonKey(name: 'config_version') required this.configVersion,
    required this.theme,
    @JsonKey(name: 'executor_profile')
    required final Map<String, dynamic> executorProfile,
    @JsonKey(name: 'disclaimer_acknowledged')
    required this.disclaimerAcknowledged,
    @JsonKey(name: 'onboarding_acknowledged')
    required this.onboardingAcknowledged,
    @JsonKey(name: 'analytics_enabled') required this.analyticsEnabled,
    @JsonKey(name: 'workspace_dir') this.workspaceDir,
    required this.language,
    @JsonKey(name: 'git_branch_prefix') required this.gitBranchPrefix,
    @JsonKey(name: 'pr_auto_description_enabled')
    required this.prAutoDescriptionEnabled,
    @JsonKey(name: 'beta_workspaces') required this.betaWorkspaces,
    @JsonKey(name: 'commit_reminder_enabled')
    required this.commitReminderEnabled,
    @JsonKey(name: 'send_message_shortcut') required this.sendMessageShortcut,
    @JsonKey(name: 'agent_order') required final List<String> agentOrder,
    @JsonKey(name: 'project_order') required final List<String> projectOrder,
    @JsonKey(name: 'agent_enabled') required final List<String> agentEnabled,
    @JsonKey(name: 'commit_message_enabled') required this.commitMessageEnabled,
  }) : _executorProfile = executorProfile,
       _agentOrder = agentOrder,
       _projectOrder = projectOrder,
       _agentEnabled = agentEnabled;

  factory _$ConfigImpl.fromJson(Map<String, dynamic> json) =>
      _$$ConfigImplFromJson(json);

  @override
  @JsonKey(name: 'config_version')
  final String configVersion;
  @override
  final String theme;
  final Map<String, dynamic> _executorProfile;
  @override
  @JsonKey(name: 'executor_profile')
  Map<String, dynamic> get executorProfile {
    if (_executorProfile is EqualUnmodifiableMapView) return _executorProfile;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_executorProfile);
  }

  @override
  @JsonKey(name: 'disclaimer_acknowledged')
  final bool disclaimerAcknowledged;
  @override
  @JsonKey(name: 'onboarding_acknowledged')
  final bool onboardingAcknowledged;
  @override
  @JsonKey(name: 'analytics_enabled')
  final bool analyticsEnabled;
  @override
  @JsonKey(name: 'workspace_dir')
  final String? workspaceDir;
  @override
  final String language;
  @override
  @JsonKey(name: 'git_branch_prefix')
  final String gitBranchPrefix;
  @override
  @JsonKey(name: 'pr_auto_description_enabled')
  final bool prAutoDescriptionEnabled;
  @override
  @JsonKey(name: 'beta_workspaces')
  final bool betaWorkspaces;
  @override
  @JsonKey(name: 'commit_reminder_enabled')
  final bool commitReminderEnabled;
  @override
  @JsonKey(name: 'send_message_shortcut')
  final String sendMessageShortcut;
  final List<String> _agentOrder;
  @override
  @JsonKey(name: 'agent_order')
  List<String> get agentOrder {
    if (_agentOrder is EqualUnmodifiableListView) return _agentOrder;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_agentOrder);
  }

  final List<String> _projectOrder;
  @override
  @JsonKey(name: 'project_order')
  List<String> get projectOrder {
    if (_projectOrder is EqualUnmodifiableListView) return _projectOrder;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_projectOrder);
  }

  final List<String> _agentEnabled;
  @override
  @JsonKey(name: 'agent_enabled')
  List<String> get agentEnabled {
    if (_agentEnabled is EqualUnmodifiableListView) return _agentEnabled;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_agentEnabled);
  }

  @override
  @JsonKey(name: 'commit_message_enabled')
  final bool commitMessageEnabled;

  @override
  String toString() {
    return 'Config(configVersion: $configVersion, theme: $theme, executorProfile: $executorProfile, disclaimerAcknowledged: $disclaimerAcknowledged, onboardingAcknowledged: $onboardingAcknowledged, analyticsEnabled: $analyticsEnabled, workspaceDir: $workspaceDir, language: $language, gitBranchPrefix: $gitBranchPrefix, prAutoDescriptionEnabled: $prAutoDescriptionEnabled, betaWorkspaces: $betaWorkspaces, commitReminderEnabled: $commitReminderEnabled, sendMessageShortcut: $sendMessageShortcut, agentOrder: $agentOrder, projectOrder: $projectOrder, agentEnabled: $agentEnabled, commitMessageEnabled: $commitMessageEnabled)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ConfigImpl &&
            (identical(other.configVersion, configVersion) ||
                other.configVersion == configVersion) &&
            (identical(other.theme, theme) || other.theme == theme) &&
            const DeepCollectionEquality().equals(
              other._executorProfile,
              _executorProfile,
            ) &&
            (identical(other.disclaimerAcknowledged, disclaimerAcknowledged) ||
                other.disclaimerAcknowledged == disclaimerAcknowledged) &&
            (identical(other.onboardingAcknowledged, onboardingAcknowledged) ||
                other.onboardingAcknowledged == onboardingAcknowledged) &&
            (identical(other.analyticsEnabled, analyticsEnabled) ||
                other.analyticsEnabled == analyticsEnabled) &&
            (identical(other.workspaceDir, workspaceDir) ||
                other.workspaceDir == workspaceDir) &&
            (identical(other.language, language) ||
                other.language == language) &&
            (identical(other.gitBranchPrefix, gitBranchPrefix) ||
                other.gitBranchPrefix == gitBranchPrefix) &&
            (identical(
                  other.prAutoDescriptionEnabled,
                  prAutoDescriptionEnabled,
                ) ||
                other.prAutoDescriptionEnabled == prAutoDescriptionEnabled) &&
            (identical(other.betaWorkspaces, betaWorkspaces) ||
                other.betaWorkspaces == betaWorkspaces) &&
            (identical(other.commitReminderEnabled, commitReminderEnabled) ||
                other.commitReminderEnabled == commitReminderEnabled) &&
            (identical(other.sendMessageShortcut, sendMessageShortcut) ||
                other.sendMessageShortcut == sendMessageShortcut) &&
            const DeepCollectionEquality().equals(
              other._agentOrder,
              _agentOrder,
            ) &&
            const DeepCollectionEquality().equals(
              other._projectOrder,
              _projectOrder,
            ) &&
            const DeepCollectionEquality().equals(
              other._agentEnabled,
              _agentEnabled,
            ) &&
            (identical(other.commitMessageEnabled, commitMessageEnabled) ||
                other.commitMessageEnabled == commitMessageEnabled));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    configVersion,
    theme,
    const DeepCollectionEquality().hash(_executorProfile),
    disclaimerAcknowledged,
    onboardingAcknowledged,
    analyticsEnabled,
    workspaceDir,
    language,
    gitBranchPrefix,
    prAutoDescriptionEnabled,
    betaWorkspaces,
    commitReminderEnabled,
    sendMessageShortcut,
    const DeepCollectionEquality().hash(_agentOrder),
    const DeepCollectionEquality().hash(_projectOrder),
    const DeepCollectionEquality().hash(_agentEnabled),
    commitMessageEnabled,
  );

  /// Create a copy of Config
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ConfigImplCopyWith<_$ConfigImpl> get copyWith =>
      __$$ConfigImplCopyWithImpl<_$ConfigImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ConfigImplToJson(this);
  }
}

abstract class _Config implements Config {
  const factory _Config({
    @JsonKey(name: 'config_version') required final String configVersion,
    required final String theme,
    @JsonKey(name: 'executor_profile')
    required final Map<String, dynamic> executorProfile,
    @JsonKey(name: 'disclaimer_acknowledged')
    required final bool disclaimerAcknowledged,
    @JsonKey(name: 'onboarding_acknowledged')
    required final bool onboardingAcknowledged,
    @JsonKey(name: 'analytics_enabled') required final bool analyticsEnabled,
    @JsonKey(name: 'workspace_dir') final String? workspaceDir,
    required final String language,
    @JsonKey(name: 'git_branch_prefix') required final String gitBranchPrefix,
    @JsonKey(name: 'pr_auto_description_enabled')
    required final bool prAutoDescriptionEnabled,
    @JsonKey(name: 'beta_workspaces') required final bool betaWorkspaces,
    @JsonKey(name: 'commit_reminder_enabled')
    required final bool commitReminderEnabled,
    @JsonKey(name: 'send_message_shortcut')
    required final String sendMessageShortcut,
    @JsonKey(name: 'agent_order') required final List<String> agentOrder,
    @JsonKey(name: 'project_order') required final List<String> projectOrder,
    @JsonKey(name: 'agent_enabled') required final List<String> agentEnabled,
    @JsonKey(name: 'commit_message_enabled')
    required final bool commitMessageEnabled,
  }) = _$ConfigImpl;

  factory _Config.fromJson(Map<String, dynamic> json) = _$ConfigImpl.fromJson;

  @override
  @JsonKey(name: 'config_version')
  String get configVersion;
  @override
  String get theme;
  @override
  @JsonKey(name: 'executor_profile')
  Map<String, dynamic> get executorProfile;
  @override
  @JsonKey(name: 'disclaimer_acknowledged')
  bool get disclaimerAcknowledged;
  @override
  @JsonKey(name: 'onboarding_acknowledged')
  bool get onboardingAcknowledged;
  @override
  @JsonKey(name: 'analytics_enabled')
  bool get analyticsEnabled;
  @override
  @JsonKey(name: 'workspace_dir')
  String? get workspaceDir;
  @override
  String get language;
  @override
  @JsonKey(name: 'git_branch_prefix')
  String get gitBranchPrefix;
  @override
  @JsonKey(name: 'pr_auto_description_enabled')
  bool get prAutoDescriptionEnabled;
  @override
  @JsonKey(name: 'beta_workspaces')
  bool get betaWorkspaces;
  @override
  @JsonKey(name: 'commit_reminder_enabled')
  bool get commitReminderEnabled;
  @override
  @JsonKey(name: 'send_message_shortcut')
  String get sendMessageShortcut;
  @override
  @JsonKey(name: 'agent_order')
  List<String> get agentOrder;
  @override
  @JsonKey(name: 'project_order')
  List<String> get projectOrder;
  @override
  @JsonKey(name: 'agent_enabled')
  List<String> get agentEnabled;
  @override
  @JsonKey(name: 'commit_message_enabled')
  bool get commitMessageEnabled;

  /// Create a copy of Config
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ConfigImplCopyWith<_$ConfigImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
