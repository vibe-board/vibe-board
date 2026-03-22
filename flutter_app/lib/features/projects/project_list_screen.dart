import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class ProjectListScreen extends ConsumerWidget {
  const ProjectListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              // TODO: create project dialog
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.dashboard_rounded,
              size: 48,
              color: AppColors.textLow,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'No projects yet',
              style: TextStyle(
                color: AppColors.textNormal,
                fontSize: 15,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Connect to a server to get started',
              style: TextStyle(
                color: AppColors.textLow,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
