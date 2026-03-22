import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class ChangeTargetBranchDialog extends ConsumerStatefulWidget {
  const ChangeTargetBranchDialog({
    super.key,
    required this.attemptId,
    required this.currentBranch,
  });
  final String attemptId;
  final String currentBranch;

  @override
  ConsumerState<ChangeTargetBranchDialog> createState() =>
      _ChangeTargetBranchDialogState();
}

class _ChangeTargetBranchDialogState
    extends ConsumerState<ChangeTargetBranchDialog> {
  final _controller = TextEditingController();
  List<String> _branches = [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadBranches() async {
    try {
      final attemptsApi = ref.read(attemptsApiProvider);
      if (attemptsApi == null) return;
      final attempt = await attemptsApi.get(widget.attemptId);
      final reposApi = ref.read(reposApiProvider);
      if (reposApi == null) return;
      final branches = await reposApi.getBranches(attempt.containerRef ?? '');
      setState(() {
        _branches = branches;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    final branch = _controller.text.trim();
    if (branch.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref
          .read(attemptsApiProvider)
          ?.changeTargetBranch(widget.attemptId, targetBranch: branch);
      if (mounted) Navigator.of(context).pop(true);
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
        'Change Target Branch',
        style: TextStyle(
          color: AppColors.textHigh,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
      content: SizedBox(
        width: 400,
        child: _loading
            ? const Center(
                child:
                    CircularProgressIndicator(color: AppColors.brand))
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Text(
                        'Failed to load branches: $_error',
                        style: const TextStyle(
                            color: AppColors.error, fontSize: 12),
                      ),
                    ),
                  TextField(
                    controller: _controller,
                    decoration: InputDecoration(
                      hintText: 'Branch name',
                      hintStyle: const TextStyle(
                          color: AppColors.textLow, fontSize: 13),
                      filled: true,
                      fillColor: AppColors.bgSurface,
                      border: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(AppSpacing.borderRadius),
                        borderSide:
                            const BorderSide(color: AppColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(AppSpacing.borderRadius),
                        borderSide:
                            const BorderSide(color: AppColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(AppSpacing.borderRadius),
                        borderSide:
                            const BorderSide(color: AppColors.brand),
                      ),
                    ),
                    style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 13,
                        fontFamily: 'IBM Plex Sans'),
                  ),
                  if (_branches.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    const Text(
                      'Available branches:',
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    SizedBox(
                      height: 150,
                      child: ListView.builder(
                        itemCount: _branches.length,
                        itemBuilder: (context, index) {
                          final branch = _branches[index];
                          return InkWell(
                            onTap: () => _controller.text = branch,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.xs,
                                horizontal: AppSpacing.sm,
                              ),
                              child: Text(
                                branch,
                                style: TextStyle(
                                  color: branch == _controller.text
                                      ? AppColors.brand
                                      : AppColors.textNormal,
                                  fontSize: 12,
                                  fontFamily: 'IBM Plex Mono',
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
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
              : const Text('Change',
                  style: TextStyle(
                      color: AppColors.brand,
                      fontFamily: 'IBM Plex Sans')),
        ),
      ],
    );
  }
}
