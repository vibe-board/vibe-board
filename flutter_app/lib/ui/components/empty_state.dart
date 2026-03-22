import 'package:flutter/material.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

/// Empty state with icon, title, description, and optional action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.description,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? description;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.textLow),
            const SizedBox(height: AppSpacing.lg),
            Text(
              title,
              style: const TextStyle(
                color: AppColors.textNormal,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
            if (description != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                description!,
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Sans',
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.xl),
              Material(
                color: AppColors.brand,
                borderRadius:
                    BorderRadius.circular(AppSpacing.borderRadius),
                child: InkWell(
                  onTap: onAction,
                  borderRadius:
                      BorderRadius.circular(AppSpacing.borderRadius),
                  hoverColor: AppColors.brandHover,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: AppSpacing.md,
                    ),
                    child: Text(
                      actionLabel!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
