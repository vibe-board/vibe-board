import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

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
    return Scaffold(
      appBar: AppBar(
        title: Text('Task $taskId'),
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.task_alt_rounded,
              size: 48,
              color: AppColors.textLow,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Task detail — Project $projectId',
              style: TextStyle(
                color: AppColors.textNormal,
                fontSize: 15,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
