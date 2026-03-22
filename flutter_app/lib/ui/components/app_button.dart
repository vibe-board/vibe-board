import 'package:flutter/material.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

enum AppButtonVariant { primary, secondary, ghost }

enum AppButtonSize { sm, md }

/// Linear-style flat button with purple brand accent.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.icon,
    this.fullWidth = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final IconData? icon;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final colors = switch (variant) {
      AppButtonVariant.primary => (
          bg: AppColors.brand,
          bgHover: AppColors.brandHover,
          text: Colors.white,
          border: Colors.transparent,
        ),
      AppButtonVariant.secondary => (
          bg: AppColors.bgElevated,
          bgHover: AppColors.bgOverlay,
          text: AppColors.textHigh,
          border: AppColors.border,
        ),
      AppButtonVariant.ghost => (
          bg: Colors.transparent,
          bgHover: AppColors.hover,
          text: AppColors.textNormal,
          border: Colors.transparent,
        ),
    };

    final padding = switch (size) {
      AppButtonSize.sm => const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
      AppButtonSize.md => const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
    };

    final textStyle = TextStyle(
      fontSize: size == AppButtonSize.sm ? 12 : 13,
      fontWeight: FontWeight.w500,
      fontFamily: 'IBM Plex Sans',
    );

    final child = Row(
      mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: AppSpacing.iconSize, color: colors.text),
          const SizedBox(width: AppSpacing.sm),
        ],
        Text(label, style: textStyle.copyWith(color: colors.text)),
      ],
    );

    return Material(
      color: colors.bg,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      child: InkWell(
        onTap: onPressed,
        hoverColor: colors.bgHover,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        child: Container(
          width: fullWidth ? double.infinity : null,
          padding: padding,
          decoration: BoxDecoration(
            border: Border.all(color: colors.border, width: variant == AppButtonVariant.secondary ? 1 : 0),
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
          ),
          child: child,
        ),
      ),
    );
  }
}
