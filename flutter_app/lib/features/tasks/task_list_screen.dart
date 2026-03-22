import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class TaskListScreen extends ConsumerWidget {
  const TaskListScreen({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Tasks — $projectId'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              // TODO: create task dialog
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.view_kanban_rounded,
              size: 48,
              color: AppColors.textLow,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Kanban board',
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
