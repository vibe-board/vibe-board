import 'package:flutter/material.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

/// Shows a Linear-style dialog with dark theme styling.
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required String title,
  required Widget child,
  double maxWidth = 480,
}) {
  return showDialog<T>(
    context: context,
    builder: (context) => Dialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded,
                        size: AppSpacing.iconSize),
                    color: AppColors.textLow,
                    splashRadius: 16,
                    onPressed: () => Navigator.of(context).pop(),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 24,
                      minHeight: 24,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: child,
            ),
          ],
        ),
      ),
    ),
  );
}
