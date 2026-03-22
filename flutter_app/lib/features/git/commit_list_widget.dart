import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/commit.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';


final _commitsProvider = FutureProvider.family<List<Commit>, String>((ref, attemptId) {
  final api = ref.watch(attemptsApiProvider);
  if (api == null) return [];
  return api.getCommits(attemptId);
});

class CommitListWidget extends ConsumerWidget {
  const CommitListWidget({
    super.key,
    required this.attemptId,
    this.onCommitTap,
  });

  final String attemptId;
  final void Function(Commit commit)? onCommitTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final commitsAsync = ref.watch(_commitsProvider(attemptId));

    return commitsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      ),
      error: (error, _) => Text(
        'Failed to load commits: $error',
        style: const TextStyle(color: AppColors.error, fontSize: 13),
      ),
      data: (commits) {
        if (commits.isEmpty) {
          return Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.xl),
            decoration: BoxDecoration(
              color: AppColors.bgSurface,
              borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
              border: Border.all(color: AppColors.border),
            ),
            child: const Text(
              'No commits yet.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textLow, fontSize: 13, fontFamily: 'IBM Plex Sans'),
            ),
          );
        }

        return Container(
          decoration: BoxDecoration(
            color: AppColors.bgSurface,
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: commits.map((commit) => _CommitTile(
              commit: commit,
              onTap: onCommitTap != null ? () => onCommitTap!(commit) : null,
            )).toList(),
          ),
        );
      },
    );
  }
}

class _CommitTile extends StatelessWidget {
  const _CommitTile({required this.commit, this.onTap});
  final Commit commit;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: AppColors.border),
          ),
        ),
        child: Row(
          children: [
            // SHA
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xxs,
              ),
              decoration: BoxDecoration(
                color: AppColors.bgPanel,
                borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
              ),
              child: Text(
                commit.sha.substring(0, 7),
                style: const TextStyle(
                  color: AppColors.brandText,
                  fontSize: 11,
                  fontFamily: 'IBM Plex Mono',
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            // Message
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    commit.message,
                    style: const TextStyle(
                      color: AppColors.textHigh,
                      fontSize: 13,
                      fontFamily: 'IBM Plex Sans',
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (commit.author.isNotEmpty)
                    Text(
                      commit.author,
                      style: const TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                ],
              ),
            ),
            // Date
            Text(
              _formatTimeAgo(commit.date),
              style: const TextStyle(
                color: AppColors.textLow,
                fontSize: 11,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
            if (onTap != null) ...[
              const SizedBox(width: AppSpacing.sm),
              const Icon(Icons.chevron_right_rounded, size: 16, color: AppColors.textLow),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTimeAgo(String iso) {
    final date = DateTime.tryParse(iso);
    if (date == null) return iso;
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
