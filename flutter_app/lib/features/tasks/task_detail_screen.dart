import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/task.dart';
import '../../core/models/workspace.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';
import '../../ui/components/app_button.dart';
import '../../ui/components/empty_state.dart';

final _taskProvider = FutureProvider.family<Task, String>((ref, taskId) {
  final api = ref.watch(tasksApiProvider);
  if (api == null) throw Exception('No server connected');
  return api.getById(taskId);
});

final _attemptsProvider =
    FutureProvider.family<List<Workspace>, String>((ref, taskId) {
  final api = ref.watch(attemptsApiProvider);
  if (api == null) return [];
  return api.getAll(taskId: taskId);
});

class TaskDetailScreen extends ConsumerWidget {
  const TaskDetailScreen({
    super.key,
    required this.projectId,
    required this.taskId,
  });

  final String projectId;
  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final taskAsync = ref.watch(_taskProvider(taskId));

    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded,
              size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () =>
              context.go('/projects/$projectId/tasks'),
        ),
        title: const Text(
          'Task',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.image_outlined,
                size: AppSpacing.iconSizeLg),
            color: AppColors.textLow,
            splashRadius: 16,
            tooltip: 'Images',
            onPressed: () => context.push(
                '/projects/$projectId/tasks/$taskId/images'),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded,
                size: AppSpacing.iconSizeLg),
            color: AppColors.textLow,
            splashRadius: 16,
            onPressed: () => _confirmDelete(context, ref),
          ),
        ],
      ),
      body: taskAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load task',
          description: error.toString(),
        ),
        data: (task) => _TaskDetailContent(
          task: task,
          projectId: projectId,
          taskId: taskId,
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: const Text(
          'Delete task?',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: const Text(
          'This task and its attempts will be permanently deleted.',
          style: TextStyle(
            color: AppColors.textNormal,
            fontSize: 13,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel',
                style: TextStyle(
                    color: AppColors.textNormal,
                    fontFamily: 'IBM Plex Sans')),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              final container = ProviderScope.containerOf(context);
              final api = container.read(tasksApiProvider);
              api?.deleteTask(taskId).then((_) {
                if (context.mounted) {
                  context.go('/projects/$projectId/tasks');
                }
              });
            },
            child: const Text('Delete',
                style: TextStyle(
                    color: AppColors.error,
                    fontFamily: 'IBM Plex Sans')),
          ),
        ],
      ),
    );
  }
}

class _TaskDetailContent extends ConsumerWidget {
  const _TaskDetailContent({
    required this.task,
    required this.projectId,
    required this.taskId,
  });

  final Task task;
  final String projectId;
  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attemptsAsync = ref.watch(_attemptsProvider(taskId));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          Row(
            children: [
              Expanded(
                child: Text(
                  task.title,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ),
              AppBadge.status(task.status.name),
            ],
          ),
          const SizedBox(height: AppSpacing.md),

          // Description
          if (task.description != null && task.description!.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: AppColors.bgSurface,
                borderRadius:
                    BorderRadius.circular(AppSpacing.borderRadius),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                task.description!,
                style: const TextStyle(
                  color: AppColors.textNormal,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Sans',
                  height: 1.5,
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.xl),

          // Attempts section
          Row(
            children: [
              const Text(
                'Attempts',
                style: TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
              const Spacer(),
              AppButton(
                label: 'New Attempt',
                icon: Icons.add_rounded,
                size: AppButtonSize.sm,
                onPressed: () => _createAttempt(context, ref),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),

          attemptsAsync.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (error, _) => Text(
              'Failed to load attempts: $error',
              style: const TextStyle(
                color: AppColors.error,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
            data: (attempts) {
              if (attempts.isEmpty) {
                return Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.xl),
                  decoration: BoxDecoration(
                    color: AppColors.bgSurface,
                    borderRadius: BorderRadius.circular(
                        AppSpacing.borderRadius),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    'No attempts yet. Create one to start the agent.',
                    style: TextStyle(
                      color: AppColors.textLow,
                      fontSize: 13,
                      fontFamily: 'IBM Plex Sans',
                    ),
                    textAlign: TextAlign.center,
                  ),
                );
              }
              return _AttemptsTable(
                attempts: attempts,
                projectId: projectId,
                taskId: taskId,
                onAttemptTap: (attemptId) {
                  context.push(
                      '/projects/$projectId/tasks/$taskId/attempts/$attemptId/sessions');
                },
                onDiffTap: (attemptId) {
                  context.push(
                      '/projects/$projectId/tasks/$taskId/attempts/$attemptId/diff');
                },
              );
            },
          ),
        ],
      ),
    );
  }

  void _createAttempt(BuildContext context, WidgetRef ref) async {
    final api = ref.read(attemptsApiProvider);
    if (api == null) return;
    try {
      await api.create({
        'task_id': taskId,
      });
      ref.invalidate(_attemptsProvider(taskId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create attempt: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }
}

// ── Attempts Table ─────────────────────────────────────────────────────

class _AttemptsTable extends StatelessWidget {
  const _AttemptsTable({
    required this.attempts,
    required this.projectId,
    required this.taskId,
    required this.onAttemptTap,
    required this.onDiffTap,
  });

  final List<Workspace> attempts;
  final String projectId;
  final String taskId;
  final ValueChanged<String> onAttemptTap;
  final ValueChanged<String> onDiffTap;

  @override
  Widget build(BuildContext context) {
    final sorted = [...attempts]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.sm,
            ),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: AppColors.border),
              ),
            ),
            child: const Row(
              children: [
                Expanded(
                  flex: 2,
                  child: Text('Branch',
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Mono',
                      )),
                ),
                Expanded(
                  child: Text('Mode',
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Mono',
                      )),
                ),
                Expanded(
                  child: Text('Created',
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'IBM Plex Mono',
                      )),
                ),
                SizedBox(width: 64),
              ],
            ),
          ),
          // Rows
          ...sorted.map((attempt) => InkWell(
                onTap: () => onAttemptTap(attempt.id),
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
                      Expanded(
                        flex: 2,
                        child: Text(
                          attempt.branch,
                          style: const TextStyle(
                            color: AppColors.textHigh,
                            fontSize: 12,
                            fontFamily: 'IBM Plex Mono',
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          attempt.mode.name,
                          style: const TextStyle(
                            color: AppColors.textNormal,
                            fontSize: 12,
                            fontFamily: 'IBM Plex Sans',
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          _formatTimeAgo(attempt.createdAt),
                          style: const TextStyle(
                            color: AppColors.textLow,
                            fontSize: 12,
                            fontFamily: 'IBM Plex Sans',
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.code_rounded, size: 16),
                        color: AppColors.textLow,
                        tooltip: 'View diff',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                            minWidth: 28, minHeight: 28),
                        onPressed: () => onDiffTap(attempt.id),
                      ),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 16,
                        color: AppColors.textLow,
                      ),
                    ],
                  ),
                ),
              )),
        ],
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
