import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Controls for starting/stopping the dev server on an attempt.
class DevServerControls extends ConsumerWidget {
  const DevServerControls({
    super.key,
    required this.attemptId,
    this.isRunning = false,
    this.onChanged,
  });

  final String attemptId;
  final bool isRunning;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(
            isRunning ? Icons.stop_circle_rounded : Icons.play_circle_rounded,
            color: isRunning ? AppColors.success : AppColors.textLow,
            size: 18,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Dev Server',
                  style: TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  isRunning ? 'Running' : 'Stopped',
                  style: TextStyle(
                    color: isRunning ? AppColors.success : AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ],
            ),
          ),
          _DevServerButton(
            isRunning: isRunning,
            onPressed: () => _toggle(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    final api = ref.read(attemptsApiProvider);
    if (api == null) return;

    try {
      if (!isRunning) {
        await api.startDevServer(attemptId);
      }
      onChanged?.call();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }
}

class _DevServerButton extends StatelessWidget {
  const _DevServerButton({
    required this.isRunning,
    required this.onPressed,
  });

  final bool isRunning;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: isRunning
              ? AppColors.error.withValues(alpha: 0.1)
              : AppColors.brand.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
          border: Border.all(
            color: isRunning
                ? AppColors.error.withValues(alpha: 0.3)
                : AppColors.brand.withValues(alpha: 0.3),
          ),
        ),
        child: Text(
          isRunning ? 'Stop' : 'Start',
          style: TextStyle(
            color: isRunning ? AppColors.error : AppColors.brand,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
    );
  }
}
