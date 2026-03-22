import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _SettingsSection(
            title: 'General',
            children: [
              _SettingsTile(
                icon: Icons.notifications_rounded,
                title: 'Notifications',
                subtitle: 'Task updates, approvals',
                onTap: () => context.push('/settings/notifications'),
              ),
              _SettingsTile(
                icon: Icons.palette_outlined,
                title: 'Appearance',
                subtitle: 'Theme, display preferences',
                onTap: () => _showAppearanceDialog(context),
              ),
              _SettingsTile(
                icon: Icons.storage_rounded,
                title: 'Data & Storage',
                subtitle: 'Cache, offline data',
                onTap: () => _showDataDialog(context),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxl),
          _SettingsSection(
            title: 'Agent',
            children: [
              _SettingsTile(
                icon: Icons.smart_toy_rounded,
                title: 'Executor Profiles',
                subtitle: 'Claude, GPT-4, custom',
                onTap: () => context.push('/settings/executor-profiles'),
              ),
              _SettingsTile(
                icon: Icons.extension_rounded,
                title: 'MCP Servers',
                subtitle: 'Model Context Protocol',
                onTap: () => context.push('/settings/mcp-servers'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxl),
          _SettingsSection(
            title: 'About',
            children: [
              _SettingsTile(
                icon: Icons.info_outline_rounded,
                title: 'Version',
                subtitle: '1.0.0',
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showAppearanceDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: const Text(
          'Appearance',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: const Text(
          'Theme settings will be available in a future update. Currently using the default dark theme.',
          style: TextStyle(
            color: AppColors.textNormal,
            fontSize: 13,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK',
                style: TextStyle(
                    color: AppColors.brand,
                    fontFamily: 'IBM Plex Sans')),
          ),
        ],
      ),
    );
  }

  void _showDataDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: const Text(
          'Data & Storage',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: const Text(
          'Cache management will be available in a future update.',
          style: TextStyle(
            color: AppColors.textNormal,
            fontSize: 13,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK',
                style: TextStyle(
                    color: AppColors.brand,
                    fontFamily: 'IBM Plex Sans')),
          ),
        ],
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            title,
            style: TextStyle(
              color: AppColors.textLow,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
        ),
        ...children,
      ],
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.textLow, size: AppSpacing.iconSizeLg),
      title: Text(
        title,
        style: TextStyle(
          color: AppColors.textHigh,
          fontSize: 13,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(
          color: AppColors.textLow,
          fontSize: 12,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      trailing: Icon(Icons.chevron_right_rounded,
          color: AppColors.textLow, size: 18),
      onTap: onTap,
    );
  }
}
