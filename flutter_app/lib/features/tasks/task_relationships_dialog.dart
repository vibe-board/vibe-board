import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/task.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';

class TaskRelationshipsDialog extends ConsumerWidget {
  const TaskRelationshipsDialog({
    super.key,
    required this.taskId,
    required this.projectId,
  });
  final String taskId;
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Dialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 500),
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
                      'Related Tasks',
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
            Flexible(
              child: _RelatedTasksList(
                taskId: taskId,
                projectId: projectId,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RelatedTasksList extends ConsumerWidget {
  const _RelatedTasksList({
    required this.taskId,
    required this.projectId,
  });
  final String taskId;
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(tasksApiProvider);
    if (api == null) {
      return const Center(
        child: Text('No server connected',
            style: TextStyle(color: AppColors.textLow)),
      );
    }

    return FutureBuilder<List<TaskWithAttemptStatus>>(
      future: api.getAll(projectId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
              child:
                  CircularProgressIndicator(color: AppColors.brand));
        }
        if (snapshot.hasError) {
          return Center(
            child: Text('Error: ${snapshot.error}',
                style: const TextStyle(color: AppColors.error)),
          );
        }

        final tasks = snapshot.data ?? [];
        final otherTasks =
            tasks.where((t) => t.id != taskId).toList();

        if (otherTasks.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(AppSpacing.xl),
            child: Center(
              child: Text(
                'No other tasks in this project.',
                style: TextStyle(
                  color: AppColors.textLow,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(AppSpacing.md),
          itemCount: otherTasks.length,
          itemBuilder: (context, index) {
            final task = otherTasks[index];
            return Container(
              margin: const EdgeInsets.only(bottom: AppSpacing.xs),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              decoration: BoxDecoration(
                color: AppColors.bgSurface,
                borderRadius:
                    BorderRadius.circular(AppSpacing.borderRadius),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      task.title,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 13,
                        fontFamily: 'IBM Plex Sans',
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppBadge.status(task.status.name),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
