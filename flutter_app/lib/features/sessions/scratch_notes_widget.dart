import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/scratch.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _scratchProvider = FutureProvider.family<Scratch?, (String, String)>((ref, params) {
  final (scratchType, referenceId) = params;
  final api = ref.watch(scratchApiProvider);
  if (api == null) return null;
  return api.get(scratchType, referenceId);
});

class ScratchNotesWidget extends ConsumerStatefulWidget {
  const ScratchNotesWidget({
    super.key,
    required this.scratchType,
    required this.referenceId,
  });

  final String scratchType;
  final String referenceId;

  @override
  ConsumerState<ScratchNotesWidget> createState() => _ScratchNotesWidgetState();
}

class _ScratchNotesWidgetState extends ConsumerState<ScratchNotesWidget> {
  final _controller = TextEditingController();
  bool _saving = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final content = _controller.text;
    setState(() => _saving = true);
    try {
      final api = ref.read(scratchApiProvider);
      final existing = ref.read(_scratchProvider((widget.scratchType, widget.referenceId)));
      if (existing.valueOrNull != null) {
        await api?.update(widget.scratchType, widget.referenceId, content);
      } else {
        await api?.create(widget.scratchType, widget.referenceId, content);
      }
      ref.invalidate(_scratchProvider((widget.scratchType, widget.referenceId)));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scratchAsync = ref.watch(_scratchProvider((widget.scratchType, widget.referenceId)));

    return scratchAsync.when(
      loading: () => const SizedBox(
        height: 100,
        child: Center(child: CircularProgressIndicator(color: AppColors.brand, strokeWidth: 2)),
      ),
      error: (error, _) => const SizedBox.shrink(),
      data: (scratch) {
        // Populate controller with existing content
        if (scratch != null && _controller.text.isEmpty) {
          _controller.text = scratch.content;
        }

        return Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.bgSurface,
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.notes_rounded, size: 14, color: AppColors.textLow),
                  const SizedBox(width: AppSpacing.xs),
                  const Text(
                    'Scratch Notes',
                    style: TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                  const Spacer(),
                  if (_saving)
                    const SizedBox(
                      width: 14, height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _controller,
                maxLines: 8,
                decoration: const InputDecoration(
                  hintText: 'Write notes here...',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                style: const TextStyle(
                  color: AppColors.textNormal,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Sans',
                  height: 1.5,
                ),
                onChanged: (_) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 500), _save);
                },
              ),
            ],
          ),
        );
      },
    );
  }
}
