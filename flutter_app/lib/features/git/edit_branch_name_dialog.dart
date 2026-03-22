import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class EditBranchNameDialog extends ConsumerStatefulWidget {
  const EditBranchNameDialog({
    super.key,
    required this.attemptId,
    required this.currentName,
  });
  final String attemptId;
  final String currentName;

  @override
  ConsumerState<EditBranchNameDialog> createState() =>
      _EditBranchNameDialogState();
}

class _EditBranchNameDialogState
    extends ConsumerState<EditBranchNameDialog> {
  late final TextEditingController _controller;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.currentName);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _controller.text.trim();
    if (name.isEmpty || name == widget.currentName) return;
    setState(() => _submitting = true);
    try {
      await ref
          .read(attemptsApiProvider)
          ?.renameBranch(widget.attemptId, newName: name);
      if (mounted) Navigator.of(context).pop(name);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
        setState(() => _submitting = false);
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
        'Rename Branch',
        style: TextStyle(
          color: AppColors.textHigh,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      content: TextField(
        controller: _controller,
        autofocus: true,
        decoration: InputDecoration(
          hintText: 'New branch name',
          hintStyle:
              const TextStyle(color: AppColors.textLow, fontSize: 13),
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
        style: const TextStyle(
          color: AppColors.textHigh,
          fontSize: 13,
          fontFamily: 'IBM Plex Mono',
        ),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(
                  color: AppColors.textNormal,
                  fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.brand))
              : const Text('Rename',
                  style: TextStyle(
                      color: AppColors.brand,
                      fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
