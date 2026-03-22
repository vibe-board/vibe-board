import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Banner shown when an attempt has merge/rebase conflicts.
class ConflictBanner extends ConsumerWidget {
  const ConflictBanner({
    super.key,
    required this.attemptId,
    this.onResolved,
  });

  final String attemptId;
  final VoidCallback? onResolved;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded,
                  color: AppColors.warning, size: 18),
              const SizedBox(width: AppSpacing.sm),
              const Text(
                'Conflicts detected',
                style: TextStyle(
                  color: AppColors.warning,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          const Text(
            'The current operation has conflicts that need to be resolved.',
            style: TextStyle(
              color: AppColors.textNormal,
              fontSize: 12,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _ConflictAction(
                label: 'Abort',
                icon: Icons.close_rounded,
                color: AppColors.error,
                onTap: () => _abort(context, ref),
              ),
              const SizedBox(width: AppSpacing.sm),
              _ConflictAction(
                label: 'Continue',
                icon: Icons.arrow_forward_rounded,
                color: AppColors.success,
                onTap: () => _continueRebase(context, ref),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _abort(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(attemptsApiProvider)?.abortConflicts(attemptId);
      onResolved?.call();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to abort: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  Future<void> _continueRebase(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(attemptsApiProvider)?.continueRebase(attemptId);
      onResolved?.call();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to continue: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }
}

class _ConflictAction extends StatelessWidget {
  const _ConflictAction({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: AppSpacing.xs),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w500,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
