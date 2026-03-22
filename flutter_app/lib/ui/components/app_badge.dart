import 'package:flutter/material.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

/// Small pill badge for status indicators and labels.
class AppBadge extends StatelessWidget {
  const AppBadge({
    super.key,
    required this.label,
    this.color,
    this.bgColor,
  });

  final String label;
  final Color? color;
  final Color? bgColor;

  factory AppBadge.status(String status) {
    final statusColor = AppColors.statusColor(status);
    return AppBadge(
      label: statusLabel(status),
      color: statusColor,
      bgColor: statusColor.withValues(alpha: 0.15),
    );
  }

  static String statusLabel(String status) {
    return switch (status) {
      'todo' => 'To Do',
      'inprogress' => 'In Progress',
      'inreview' => 'In Review',
      'done' => 'Done',
      'cancelled' => 'Cancelled',
      _ => status,
    };
  }

  @override
  Widget build(BuildContext context) {
    final fg = color ?? AppColors.textNormal;
    final bg = bgColor ?? AppColors.bgElevated;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xxs,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w500,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    );
  }
}
