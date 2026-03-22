import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/config.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class GeneralSettingsScreen extends ConsumerStatefulWidget {
  const GeneralSettingsScreen({super.key});

  @override
  ConsumerState<GeneralSettingsScreen> createState() =>
      _GeneralSettingsScreenState();
}

class _GeneralSettingsScreenState
    extends ConsumerState<GeneralSettingsScreen> {
  String _theme = 'dark';
  String _language = 'en';
  String _gitBranchPrefix = '';
  bool _analyticsEnabled = false;
  bool _prAutoDescription = false;
  bool _commitMessageEnabled = false;
  bool _commitReminderEnabled = false;
  bool _loading = true;
  bool _saving = false;
  Config? _config;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final api = ref.read(configApiProvider);
      if (api == null) return;
      final info = await api.getSystemInfo();
      // The config is embedded in system info or loaded separately
      // For now, set defaults from system info
      setState(() {
        _theme = info['theme'] as String? ?? 'dark';
        _language = info['language'] as String? ?? 'en';
        _analyticsEnabled = info['analytics_enabled'] as bool? ?? false;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      if (_config != null) {
        final updated = _config!.copyWith(
          theme: _theme,
          language: _language,
          analyticsEnabled: _analyticsEnabled,
          gitBranchPrefix: _gitBranchPrefix,
          prAutoDescriptionEnabled: _prAutoDescription,
          commitMessageEnabled: _commitMessageEnabled,
          commitReminderEnabled: _commitReminderEnabled,
        );
        await ref.read(configApiProvider)?.saveConfig(updated);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Settings saved'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded,
              size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'General Settings',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: SizedBox(
                width: 18,
                height: 18,
                child:
                    CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.check_rounded, size: AppSpacing.iconSizeLg),
              color: AppColors.brand,
              splashRadius: 16,
              onPressed: _save,
            ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              children: [
                _SectionHeader(title: 'Appearance'),
                _DropdownTile(
                  label: 'Theme',
                  value: _theme,
                  items: const {
                    'dark': 'Dark',
                    'light': 'Light',
                    'system': 'System',
                  },
                  onChanged: (v) => setState(() => _theme = v),
                ),
                _DropdownTile(
                  label: 'Language',
                  value: _language,
                  items: const {
                    'en': 'English',
                    'zh': 'Chinese',
                    'ja': 'Japanese',
                    'ko': 'Korean',
                  },
                  onChanged: (v) => setState(() => _language = v),
                ),
                const SizedBox(height: AppSpacing.xl),
                _SectionHeader(title: 'Git'),
                _TextTile(
                  label: 'Branch Prefix',
                  value: _gitBranchPrefix,
                  hint: 'e.g. feature/',
                  onChanged: (v) => setState(() => _gitBranchPrefix = v),
                ),
                const SizedBox(height: AppSpacing.xl),
                _SectionHeader(title: 'Pull Requests'),
                _SwitchTile(
                  label: 'Auto-generate PR descriptions',
                  value: _prAutoDescription,
                  onChanged: (v) => setState(() => _prAutoDescription = v),
                ),
                const SizedBox(height: AppSpacing.xl),
                _SectionHeader(title: 'Commit Messages'),
                _SwitchTile(
                  label: 'Enable commit message generation',
                  value: _commitMessageEnabled,
                  onChanged: (v) => setState(() => _commitMessageEnabled = v),
                ),
                _SwitchTile(
                  label: 'Commit reminders',
                  value: _commitReminderEnabled,
                  onChanged: (v) => setState(() => _commitReminderEnabled = v),
                ),
                const SizedBox(height: AppSpacing.xl),
                _SectionHeader(title: 'Privacy'),
                _SwitchTile(
                  label: 'Analytics & telemetry',
                  value: _analyticsEnabled,
                  onChanged: (v) => setState(() => _analyticsEnabled = v),
                ),
              ],
            ),
    );
  }
}

// ── Shared Widgets ─────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Text(
        title,
        style: const TextStyle(
          color: AppColors.textLow,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    );
  }
}

class _DropdownTile extends StatelessWidget {
  const _DropdownTile({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final String label;
  final String value;
  final Map<String, String> items;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ),
          DropdownButton<String>(
            value: value,
            dropdownColor: AppColors.bgPanel,
            underline: const SizedBox.shrink(),
            style: const TextStyle(
              color: AppColors.brand,
              fontSize: 13,
              fontFamily: 'IBM Plex Sans',
            ),
            items: items.entries
                .map((e) => DropdownMenuItem(
                      value: e.key,
                      child: Text(e.value),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ],
      ),
    );
  }
}

class _SwitchTile extends StatelessWidget {
  const _SwitchTile({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.brand,
          ),
        ],
      ),
    );
  }
}

class _TextTile extends StatelessWidget {
  const _TextTile({
    required this.label,
    required this.value,
    required this.hint,
    required this.onChanged,
  });

  final String label;
  final String value;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ),
          Expanded(
            child: TextField(
              controller: TextEditingController(text: value)
                ..selection = TextSelection.collapsed(offset: value.length),
              decoration: InputDecoration(
                hintText: hint,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
              style: const TextStyle(
                color: AppColors.textNormal,
                fontSize: 13,
                fontFamily: 'IBM Plex Mono',
              ),
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}
