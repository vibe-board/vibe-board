import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/enums.dart';
import '../../core/models/task.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';
import '../../ui/components/app_button.dart';
import '../../ui/components/app_text_field.dart';
import '../../ui/components/app_dialog.dart';
import '../../ui/components/empty_state.dart';
import '../../utils/json_patch.dart';

/// Provides a real-time list of tasks via WebSocket JSON Patch stream.
final _tasksStreamFamily = StreamProvider.family
    .autoDispose<List<TaskWithAttemptStatus>, String>((ref, projectId) {
  final server = ref.watch(activeServerProvider);
  if (server == null) return const Stream.empty();

  // Build WebSocket URL from the server base URL.
  final baseUri = Uri.parse(server.baseUrl);
  final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
  final wsUrl =
      '$wsScheme://${baseUri.host}:${baseUri.port}/api/tasks/stream/ws?project_id=$projectId';

  return jsonPatchWsStream<List<dynamic>>(
    wsUrl: wsUrl,
    initialData: [],
  ).map((state) {
    if (state.error != null && !state.isInitialized) {
      throw Exception(state.error!);
    }
    return state.data
        .map((j) =>
            TaskWithAttemptStatus.fromJson(j as Map<String, dynamic>))
        .toList();
  });
});

class TaskListScreen extends ConsumerWidget {
  const TaskListScreen({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasksAsync = ref.watch(_tasksStreamFamily(projectId));

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
          onPressed: () => context.go('/projects'),
        ),
        title: const Text(
          'Tasks',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded,
                size: AppSpacing.iconSizeLg),
            color: AppColors.textNormal,
            splashRadius: 16,
            onPressed: () => _showCreateTaskDialog(context, ref),
          ),
        ],
      ),
      body: tasksAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load tasks',
          description: error.toString(),
        ),
        data: (tasks) {
          if (tasks.isEmpty) {
            return EmptyState(
              icon: Icons.checklist_rounded,
              title: 'No tasks yet',
              description: 'Create your first task to get started',
              actionLabel: 'New Task',
              onAction: () => _showCreateTaskDialog(context, ref),
            );
          }
          return _KanbanBoard(
            tasks: tasks,
            projectId: projectId,
            onTaskTap: (taskId) =>
                context.push('/projects/$projectId/tasks/$taskId'),
            onStatusChange: (taskId, newStatus) =>
                _updateTaskStatus(ref, taskId, newStatus),
          );
        },
      ),
    );
  }

  void _showCreateTaskDialog(BuildContext context, WidgetRef ref) {
    showAppDialog<void>(
      context: context,
      title: 'New Task',
      child: _CreateTaskForm(
        projectId: projectId,
        onCreated: (_) {
          ref.invalidate(_tasksStreamFamily(projectId));
          context.pop();
        },
      ),
    );
  }

  Future<void> _updateTaskStatus(
      WidgetRef ref, String taskId, TaskStatus newStatus) async {
    final api = ref.read(tasksApiProvider);
    if (api == null) return;
    await api.update(taskId, UpdateTask(status: newStatus));
    ref.invalidate(_tasksStreamFamily(projectId));
  }
}

// ── Kanban Board ───────────────────────────────────────────────────────

class _KanbanBoard extends StatelessWidget {
  const _KanbanBoard({
    required this.tasks,
    required this.projectId,
    required this.onTaskTap,
    required this.onStatusChange,
  });

  final List<TaskWithAttemptStatus> tasks;
  final String projectId;
  final ValueChanged<String> onTaskTap;
  final void Function(String taskId, TaskStatus status) onStatusChange;

  @override
  Widget build(BuildContext context) {
    final columns = <TaskStatus, List<TaskWithAttemptStatus>>{};
    for (final status in TaskStatus.values) {
      columns[status] = [];
    }
    for (final task in tasks) {
      columns[task.status]!.add(task);
    }
    // Sort each column newest-first.
    for (final list in columns.values) {
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth > 600;
        if (!isWide) {
          // On narrow screens, show columns vertically.
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: TaskStatus.values.map((status) {
              final columnTasks = columns[status]!;
              return _StatusColumnHeader(
                status: status,
                count: columnTasks.length,
                tasks: columnTasks,
                onTaskTap: onTaskTap,
                onStatusChange: onStatusChange,
              );
            }).toList(),
          );
        }
        // Wide: horizontal scrollable columns.
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: TaskStatus.values.map((status) {
            final columnTasks = columns[status]!;
            return Expanded(
              child: _KanbanColumn(
                status: status,
                tasks: columnTasks,
                onTaskTap: onTaskTap,
                onStatusChange: onStatusChange,
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.status,
    required this.tasks,
    required this.onTaskTap,
    required this.onStatusChange,
  });

  final TaskStatus status;
  final List<TaskWithAttemptStatus> tasks;
  final ValueChanged<String> onTaskTap;
  final void Function(String taskId, TaskStatus status) onStatusChange;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Column header
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.statusColor(status.name),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                status.label,
                style: const TextStyle(
                  color: AppColors.textNormal,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                '${tasks.length}',
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 11,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: AppColors.border),
        // Tasks
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            itemCount: tasks.length,
            itemBuilder: (context, index) => _TaskCard(
              task: tasks[index],
              onTap: () => onTaskTap(tasks[index].id),
              onStatusChange: (newStatus) =>
                  onStatusChange(tasks[index].id, newStatus),
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusColumnHeader extends StatelessWidget {
  const _StatusColumnHeader({
    required this.status,
    required this.count,
    required this.tasks,
    required this.onTaskTap,
    required this.onStatusChange,
  });

  final TaskStatus status;
  final int count;
  final List<TaskWithAttemptStatus> tasks;
  final ValueChanged<String> onTaskTap;
  final void Function(String taskId, TaskStatus status) onStatusChange;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.statusColor(status.name),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                status.label,
                style: const TextStyle(
                  color: AppColors.textNormal,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                '$count',
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 11,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
        ),
        ...tasks.map((task) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: _TaskCard(
                task: task,
                onTap: () => onTaskTap(task.id),
                onStatusChange: (newStatus) =>
                    onStatusChange(task.id, newStatus),
              ),
            )),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

// ── Task Card ──────────────────────────────────────────────────────────

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.onTap,
    required this.onStatusChange,
  });

  final TaskWithAttemptStatus task;
  final VoidCallback onTap;
  final ValueChanged<TaskStatus> onStatusChange;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.bgSurface,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        hoverColor: AppColors.hover,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius:
                BorderRadius.circular(AppSpacing.borderRadius),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title row with status indicators
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      task.title,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        fontFamily: 'IBM Plex Sans',
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (task.hasInProgressAttempt) ...[
                    const SizedBox(width: AppSpacing.sm),
                    SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.statusColor(task.status.name),
                      ),
                    ),
                  ],
                  if (task.lastAttemptFailed) ...[
                    const SizedBox(width: AppSpacing.sm),
                    const Icon(
                      Icons.error_outline_rounded,
                      size: 14,
                      color: AppColors.error,
                    ),
                  ],
                ],
              ),
              // Description preview
              if (task.description != null &&
                  task.description!.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  task.description!,
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 12,
                    fontFamily: 'IBM Plex Sans',
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              // Bottom row: status badge + executor + actions
              Row(
                children: [
                  AppBadge.status(task.status.name),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    task.executor,
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                  const Spacer(),
                  // Status change popup
                  PopupMenuButton<TaskStatus>(
                    icon: const Icon(Icons.swap_horiz_rounded,
                        size: 14, color: AppColors.textLow),
                    color: AppColors.bgElevated,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(
                          AppSpacing.borderRadius),
                      side: const BorderSide(color: AppColors.border),
                    ),
                    padding: EdgeInsets.zero,
                    itemBuilder: (context) => TaskStatus.values
                        .where((s) => s != task.status)
                        .map((s) => PopupMenuItem(
                              value: s,
                              child: Row(
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: AppColors.statusColor(s.name),
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: AppSpacing.sm),
                                  Text(
                                    s.label,
                                    style: const TextStyle(
                                      color: AppColors.textNormal,
                                      fontFamily: 'IBM Plex Sans',
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ))
                        .toList(),
                    onSelected: onStatusChange,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Create Task Form ───────────────────────────────────────────────────

class _CreateTaskForm extends StatefulWidget {
  const _CreateTaskForm({
    required this.projectId,
    required this.onCreated,
  });

  final String projectId;
  final ValueChanged<Task> onCreated;

  @override
  State<_CreateTaskForm> createState() => _CreateTaskFormState();
}

class _CreateTaskFormState extends State<_CreateTaskForm> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          controller: _titleController,
          hintText: 'Task title',
          autofocus: true,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _descriptionController,
          hintText: 'Description (optional)',
          maxLines: 3,
          minLines: 2,
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            _error!,
            style: const TextStyle(
              color: AppColors.error,
              fontSize: 12,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          label: _loading ? 'Creating...' : 'Create Task',
          onPressed: _loading ? null : _submit,
          fullWidth: true,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Task title is required');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final container = ProviderScope.containerOf(context);
      final api = container.read(tasksApiProvider);
      if (api == null) {
        setState(() {
          _error = 'No server connected';
          _loading = false;
        });
        return;
      }

      final description = _descriptionController.text.trim();
      final task = await api.create(
        CreateTask(
          projectId: widget.projectId,
          title: title,
          description: description.isNotEmpty ? description : null,
        ),
      );
      widget.onCreated(task);
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }
}
