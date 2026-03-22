import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Dialog for responding to approval requests.
class ApprovalDialog extends ConsumerStatefulWidget {
  const ApprovalDialog({
    super.key,
    required this.approvalId,
    required this.toolName,
    this.isQuestion = false,
  });

  final String approvalId;
  final String toolName;
  final bool isQuestion;

  @override
  ConsumerState<ApprovalDialog> createState() => _ApprovalDialogState();
}

class _ApprovalDialogState extends ConsumerState<ApprovalDialog> {
  final _answerController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _answerController.dispose();
    super.dispose();
  }

  Future<void> _respond({required bool approved}) async {
    setState(() => _loading = true);
    try {
      await ref.read(approvalsApiProvider)?.respond(
        widget.approvalId,
        approved: approved,
        answer: widget.isQuestion ? _answerController.text.trim() : null,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
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
      title: Row(
        children: [
          Icon(
            widget.isQuestion ? Icons.help_outline_rounded : Icons.approval_rounded,
            color: AppColors.brand,
            size: 20,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              widget.isQuestion ? 'Question' : 'Approval Required',
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.bgSurface,
              borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Tool:',
                  style: TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  widget.toolName,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
              ],
            ),
          ),
          if (widget.isQuestion) ...[
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _answerController,
              decoration: InputDecoration(
                hintText: 'Your answer...',
                hintStyle: const TextStyle(color: AppColors.textLow, fontSize: 13),
                filled: true,
                fillColor: AppColors.bgSurface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
                  borderSide: const BorderSide(color: AppColors.brand),
                ),
              ),
              style: const TextStyle(color: AppColors.textHigh, fontSize: 13),
              maxLines: 3,
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Dismiss',
              style: TextStyle(color: AppColors.textNormal, fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : () => _respond(approved: false),
          child: const Text('Deny',
              style: TextStyle(color: AppColors.error, fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : () => _respond(approved: true),
          child: _loading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand))
              : const Text('Approve',
                  style: TextStyle(color: AppColors.success, fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
