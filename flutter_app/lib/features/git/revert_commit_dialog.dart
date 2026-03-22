import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class RevertCommitDialog extends ConsumerStatefulWidget {
  const RevertCommitDialog({
    super.key,
    required this.attemptId,
    required this.sha,
    required this.message,
  });
  final String attemptId;
  final String sha;
  final String message;

  @override
  ConsumerState<RevertCommitDialog> createState() =>
      _RevertCommitDialogState();
}

class _RevertCommitDialogState extends ConsumerState<RevertCommitDialog> {
  bool _loading = false;

  Future<void> _execute() async {
    setState(() => _loading = true);
    try {
      await ref
          .read(attemptsApiProvider)
          ?.revertCommit(widget.attemptId, widget.sha);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Revert failed: $e'),
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
        'Revert Commit',
        style: TextStyle(
          color: AppColors.textHigh,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Are you sure you want to revert this commit?',
            style: TextStyle(
              color: AppColors.textNormal,
              fontSize: 13,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.bgSurface,
              borderRadius:
                  BorderRadius.circular(AppSpacing.borderRadiusSm),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.sha.length > 12
                      ? widget.sha.substring(0, 12)
                      : widget.sha,
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  widget.message,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Sans',
                  ),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
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
              : const Text('Revert',
                  style: TextStyle(
                      color: AppColors.error,
                      fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
