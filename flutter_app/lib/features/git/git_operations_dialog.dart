import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Dialog for git push operations.
class GitPushDialog extends ConsumerStatefulWidget {
  const GitPushDialog({super.key, required this.attemptId, this.force = false});
  final String attemptId;
  final bool force;

  @override
  ConsumerState<GitPushDialog> createState() => _GitPushDialogState();
}

class _GitPushDialogState extends ConsumerState<GitPushDialog> {
  bool _loading = false;

  Future<void> _execute() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(attemptsApiProvider);
      if (widget.force) {
        await api?.forcePush(widget.attemptId);
      } else {
        await api?.push(widget.attemptId);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Push failed: $e'), backgroundColor: AppColors.error),
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
      title: Text(
        widget.force ? 'Force Push' : 'Push',
        style: const TextStyle(
          color: AppColors.textHigh,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      content: Text(
        widget.force
            ? 'Force push will overwrite remote branch history. Continue?'
            : 'Push current branch to remote?',
        style: const TextStyle(
          color: AppColors.textNormal,
          fontSize: 13,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(color: AppColors.textNormal, fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : _execute,
          child: _loading
              ? const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
                )
              : Text(
                  widget.force ? 'Force Push' : 'Push',
                  style: const TextStyle(color: AppColors.brand, fontFamily: 'IBM Plex Sans'),
                ),
        ),
      ],
    );
  }
}

/// Dialog for rebase operations.
class GitRebaseDialog extends ConsumerStatefulWidget {
  const GitRebaseDialog({super.key, required this.attemptId});
  final String attemptId;

  @override
  ConsumerState<GitRebaseDialog> createState() => _GitRebaseDialogState();
}

class _GitRebaseDialogState extends ConsumerState<GitRebaseDialog> {
  bool _loading = false;

  Future<void> _execute() async {
    setState(() => _loading = true);
    try {
      await ref.read(attemptsApiProvider)?.rebase(widget.attemptId);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Rebase failed: $e'), backgroundColor: AppColors.error),
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
      title: const Text('Rebase',
          style: TextStyle(color: AppColors.textHigh, fontSize: 15, fontWeight: FontWeight.w600, fontFamily: 'IBM Plex Sans')),
      content: const Text(
        'Rebase current branch onto target branch? This may require resolving conflicts.',
        style: TextStyle(color: AppColors.textNormal, fontSize: 13, fontFamily: 'IBM Plex Sans'),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(color: AppColors.textNormal, fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : _execute,
          child: _loading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand))
              : const Text('Rebase',
                  style: TextStyle(color: AppColors.brand, fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}

/// Dialog for creating a PR.
class CreatePrDialog extends ConsumerStatefulWidget {
  const CreatePrDialog({super.key, required this.attemptId});
  final String attemptId;

  @override
  ConsumerState<CreatePrDialog> createState() => _CreatePrDialogState();
}

class _CreatePrDialogState extends ConsumerState<CreatePrDialog> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _execute() async {
    setState(() => _loading = true);
    try {
      final result = await ref.read(attemptsApiProvider)?.createPr(
        widget.attemptId,
        title: _titleController.text.trim().isNotEmpty ? _titleController.text.trim() : null,
        body: _bodyController.text.trim().isNotEmpty ? _bodyController.text.trim() : null,
      );
      if (mounted) Navigator.of(context).pop(result);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create PR: $e'), backgroundColor: AppColors.error),
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
      title: const Text('Create Pull Request',
          style: TextStyle(color: AppColors.textHigh, fontSize: 15, fontWeight: FontWeight.w600, fontFamily: 'IBM Plex Sans')),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: 'PR title',
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
              style: const TextStyle(color: AppColors.textHigh, fontSize: 13, fontFamily: 'IBM Plex Sans'),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _bodyController,
              maxLines: 5,
              decoration: InputDecoration(
                hintText: 'Description (optional)',
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
              style: const TextStyle(color: AppColors.textHigh, fontSize: 13, fontFamily: 'IBM Plex Sans'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel',
              style: TextStyle(color: AppColors.textNormal, fontFamily: 'IBM Plex Sans')),
        ),
        TextButton(
          onPressed: _loading ? null : _execute,
          child: _loading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand))
              : const Text('Create PR',
                  style: TextStyle(color: AppColors.brand, fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
