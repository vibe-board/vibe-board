import 'package:flutter/material.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _taskCompleted = true;
  bool _taskFailed = true;
  bool _approvalRequired = true;
  bool _sessionStarted = false;
  bool _prMerged = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon:
              const Icon(Icons.arrow_back_rounded, size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Notifications',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        children: [
          const Text(
            'Push Notifications',
            style: TextStyle(
              color: AppColors.textLow,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _NotificationTile(
            icon: Icons.check_circle_outline_rounded,
            title: 'Task Completed',
            subtitle: 'When an agent finishes a task',
            value: _taskCompleted,
            onChanged: (v) => setState(() => _taskCompleted = v),
          ),
          _NotificationTile(
            icon: Icons.error_outline_rounded,
            title: 'Task Failed',
            subtitle: 'When a task execution fails',
            value: _taskFailed,
            onChanged: (v) => setState(() => _taskFailed = v),
          ),
          _NotificationTile(
            icon: Icons.approval_rounded,
            title: 'Approval Required',
            subtitle: 'When agent needs your approval',
            value: _approvalRequired,
            onChanged: (v) => setState(() => _approvalRequired = v),
          ),
          _NotificationTile(
            icon: Icons.play_circle_outline_rounded,
            title: 'Session Started',
            subtitle: 'When a new session begins',
            value: _sessionStarted,
            onChanged: (v) => setState(() => _sessionStarted = v),
          ),
          _NotificationTile(
            icon: Icons.merge_rounded,
            title: 'PR Merged',
            subtitle: 'When a pull request is merged',
            value: _prMerged,
            onChanged: (v) => setState(() => _prMerged = v),
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textLow, size: AppSpacing.iconSizeLg),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ],
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
