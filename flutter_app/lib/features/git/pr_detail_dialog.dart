import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';
import '../../ui/components/app_button.dart';

final _prCommentsProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, attemptId) {
  final api = ref.watch(attemptsApiProvider);
  if (api == null) return {};
  return api.getPrComments(attemptId);
});

class PrDetailDialog extends ConsumerWidget {
  const PrDetailDialog({
    super.key,
    required this.attemptId,
    required this.prData,
  });

  final String attemptId;
  final Map<String, dynamic> prData;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = prData['title'] as String? ?? 'Untitled PR';
    final body = prData['body'] as String? ?? '';
    final state = prData['state'] as String? ?? 'open';
    final url = prData['html_url'] as String? ?? prData['url'] as String? ?? '';
    final number = prData['number'];
    final commentsAsync = ref.watch(_prCommentsProvider(attemptId));

    return Dialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.md,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  const Icon(Icons.merge_rounded,
                      size: 18, color: AppColors.brand),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      number != null ? 'PR #$number' : 'Pull Request',
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ),
                  AppBadge(
                    label: state,
                    color: state == 'open'
                        ? AppColors.success
                        : state == 'merged'
                            ? AppColors.brand
                            : AppColors.textLow,
                  ),
                  const SizedBox(width: AppSpacing.sm),
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
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Title
                    Text(
                      title,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.md),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: AppColors.bgSurface,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.borderRadiusSm),
                        ),
                        child: Text(
                          body,
                          style: const TextStyle(
                            color: AppColors.textNormal,
                            fontSize: 13,
                            fontFamily: 'IBM Plex Sans',
                            height: 1.5,
                          ),
                        ),
                      ),
                    ],
                    if (url.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        url,
                        style: const TextStyle(
                          color: AppColors.brandText,
                          fontSize: 12,
                          fontFamily: 'IBM Plex Mono',
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    // Comments
                    const Text(
                      'Comments',
                      style: TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    commentsAsync.when(
                      loading: () => const Center(
                        child: CircularProgressIndicator(
                            color: AppColors.brand, strokeWidth: 2),
                      ),
                      error: (error, _) => Text(
                        'Failed to load comments: $error',
                        style: const TextStyle(
                            color: AppColors.error, fontSize: 12),
                      ),
                      data: (data) {
                        final comments =
                            data['comments'] as List<dynamic>? ?? [];
                        if (comments.isEmpty) {
                          return const Text(
                            'No comments yet.',
                            style: TextStyle(
                              color: AppColors.textLow,
                              fontSize: 13,
                              fontFamily: 'IBM Plex Sans',
                            ),
                          );
                        }
                        return Column(
                          children: comments
                              .map((c) => _CommentTile(
                                  comment: c as Map<String, dynamic>))
                              .toList(),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
            // Actions
            if (state == 'open')
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
                child: Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: 'Merge',
                        icon: Icons.merge_rounded,
                        onPressed: () {
                          final api = ref.read(attemptsApiProvider);
                          api?.merge(attemptId, {}).then((_) {
                            if (context.mounted) Navigator.of(context).pop();
                          });
                        },
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.comment});
  final Map<String, dynamic> comment;

  @override
  Widget build(BuildContext context) {
    final user = comment['user'] as Map<String, dynamic>?;
    final login = user?['login'] as String? ?? 'Unknown';
    final body = comment['body'] as String? ?? '';
    final createdAt = comment['created_at'] as String? ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                login,
                style: const TextStyle(
                  color: AppColors.brandText,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
              const Spacer(),
              Text(
                createdAt,
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 10,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
          if (body.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              body,
              style: const TextStyle(
                color: AppColors.textNormal,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
