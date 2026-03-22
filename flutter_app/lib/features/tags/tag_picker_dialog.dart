import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/tag.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_text_field.dart';

final _allTagsProvider = FutureProvider<List<Tag>>((ref) {
  final api = ref.watch(tagsApiProvider);
  if (api == null) return [];
  return api.getAll();
});

class TagPickerDialog extends ConsumerWidget {
  const TagPickerDialog({
    super.key,
    required this.selectedTagIds,
    required this.onTagsChanged,
  });

  final Set<String> selectedTagIds;
  final ValueChanged<Set<String>> onTagsChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tagsAsync = ref.watch(_allTagsProvider);

    return Dialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.md,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Tags',
                      style: TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    color: AppColors.textLow,
                    splashRadius: 16,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: tagsAsync.when(
                loading: () => const Center(
                  child:
                      CircularProgressIndicator(color: AppColors.brand),
                ),
                error: (error, _) => Text(
                  'Failed to load tags: $error',
                  style:
                      const TextStyle(color: AppColors.error, fontSize: 13),
                ),
                data: (tags) {
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (tags.isEmpty)
                        const Text(
                          'No tags yet. Create one below.',
                          style: TextStyle(
                            color: AppColors.textLow,
                            fontSize: 13,
                            fontFamily: 'IBM Plex Sans',
                          ),
                        ),
                      ...tags.map((tag) => _TagCheckbox(
                            tag: tag,
                            selected: selectedTagIds.contains(tag.id),
                            onChanged: (selected) {
                              final updated = Set<String>.from(selectedTagIds);
                              if (selected) {
                                updated.add(tag.id);
                              } else {
                                updated.remove(tag.id);
                              }
                              onTagsChanged(updated);
                            },
                          )),
                      const SizedBox(height: AppSpacing.md),
                      _CreateTagInline(onCreated: () {
                        ref.invalidate(_allTagsProvider);
                      }),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagCheckbox extends StatelessWidget {
  const _TagCheckbox({
    required this.tag,
    required this.selected,
    required this.onChanged,
  });

  final Tag tag;
  final bool selected;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!selected),
      borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.xs,
          horizontal: AppSpacing.xs,
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.check_box_rounded
                  : Icons.check_box_outline_blank_rounded,
              size: 18,
              color: selected ? AppColors.brand : AppColors.textLow,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                tag.tagName,
                style: const TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateTagInline extends ConsumerStatefulWidget {
  const _CreateTagInline({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_CreateTagInline> createState() => _CreateTagInlineState();
}

class _CreateTagInlineState extends ConsumerState<_CreateTagInline> {
  final _controller = TextEditingController();
  bool _creating = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _controller.text.trim();
    if (name.isEmpty) return;
    setState(() => _creating = true);
    try {
      final api = ref.read(tagsApiProvider);
      await api?.create(CreateTag(tagName: name, content: ''));
      _controller.clear();
      widget.onCreated();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create tag: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: AppTextField(
            controller: _controller,
            hintText: 'New tag name',
            onSubmitted: (_) => _create(),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        IconButton(
          icon: _creating
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child:
                      CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand),
                )
              : const Icon(Icons.add_rounded, size: 20),
          color: AppColors.brand,
          onPressed: _creating ? null : _create,
        ),
      ],
    );
  }
}
