import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class StartReviewDialog extends ConsumerStatefulWidget {
  const StartReviewDialog({
    super.key,
    required this.sessionId,
  });
  final String sessionId;

  @override
  ConsumerState<StartReviewDialog> createState() =>
      _StartReviewDialogState();
}

class _StartReviewDialogState extends ConsumerState<StartReviewDialog> {
  bool _loading = false;

  Future<void> _execute() async {
    setState(() => _loading = true);
    try {
      await ref
          .read(sessionsApiProvider)
          ?.startReview(widget.sessionId);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to start review: $e'),
            backgroundColor: AppColors.error,
          ),
        );
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      ),
      title: const Text(
        'Start Review',
        style: TextStyle(
          color: AppColors.textHigh,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      content: const Text(
        'Start a review session for the current execution? This will analyze the changes and provide feedback.',
        style: TextStyle(
          color: AppColors.textNormal,
          fontSize: 13,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(
                  color: AppColors.textNormal,
                  fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : _execute,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.brand))
              : const Text('Start Review',
                  style: TextStyle(
                      color: AppColors.brand,
                      fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
