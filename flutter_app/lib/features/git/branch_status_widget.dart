import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _branchStatusProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, attemptId) {
  final api = ref.watch(attemptsApiProvider);
  if (api == null) return {};
  return api.getBranchStatus(attemptId);
});

class BranchStatusWidget extends ConsumerWidget {
  const BranchStatusWidget({super.key, required this.attemptId});

  final String attemptId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(_branchStatusProvider(attemptId));

    return statusAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (status) {
        final branchName = status['branch_name'] as String? ?? '';
        final ahead = status['ahead'] as int? ?? 0;
        final behind = status['behind'] as int? ?? 0;
        final lastCommit = status['last_commit'] as String? ?? '';

        if (branchName.isEmpty) return const SizedBox.shrink();

        return Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: AppColors.bgSurface,
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              const Icon(Icons.account_tree_rounded,
                  size: 14, color: AppColors.textLow),
              const SizedBox(width: AppSpacing.sm),
              Text(
                branchName,
                style: const TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 12,
                  fontFamily: 'IBM Plex Mono',
                ),
              ),
              const Spacer(),
              if (ahead > 0) ...[
                Icon(Icons.arrow_upward_rounded,
                    size: 12, color: AppColors.success),
                const SizedBox(width: 2),
                Text(
                  '$ahead',
                  style: const TextStyle(
                    color: AppColors.success,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              if (behind > 0) ...[
                Icon(Icons.arrow_downward_rounded,
                    size: 12, color: AppColors.warning),
                const SizedBox(width: 2),
                Text(
                  '$behind',
                  style: const TextStyle(
                    color: AppColors.warning,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              if (lastCommit.isNotEmpty)
                Text(
                  lastCommit.length > 7 ? lastCommit.substring(0, 7) : lastCommit,
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
