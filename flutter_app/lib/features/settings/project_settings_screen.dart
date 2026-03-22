import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/project.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _projectsProvider = FutureProvider<List<Project>>((ref) async {
  final api = ref.watch(projectsApiProvider);
  if (api == null) return [];
  return api.getAll();
});

class ProjectSettingsScreen extends ConsumerWidget {
  const ProjectSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(_projectsProvider);

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
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Project Settings',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: projectsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand)),
        error: (error, _) => Center(
          child: Text('Error: $error',
              style: const TextStyle(color: AppColors.error)),
        ),
        data: (projects) {
          if (projects.isEmpty) {
            return const Center(
              child: Text('No projects',
                  style: TextStyle(color: AppColors.textLow)),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.xl),
            itemCount: projects.length,
            itemBuilder: (context, index) {
              final project = projects[index];
              return _ProjectTile(
                project: project,
                onEdit: () => _showEditDialog(context, ref, project),
                onDelete: () => _confirmDelete(context, ref, project),
              );
            },
          );
        },
      ),
    );
  }

  void _showEditDialog(
      BuildContext context, WidgetRef ref, Project project) {
    final controller = TextEditingController(text: project.name);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: const Text(
          'Edit Project',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(
            hintText: 'Project name',
            filled: true,
            fillColor: AppColors.bgSurface,
            border: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppSpacing.borderRadius),
              borderSide: const BorderSide(color: AppColors.border),
            ),
          ),
          style: const TextStyle(
              color: AppColors.textHigh,
              fontSize: 13,
              fontFamily: 'IBM Plex Sans'),
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
            onPressed: () async {
              final name = controller.text.trim();
              if (name.isEmpty) return;
              try {
                await ref
                    .read(projectsApiProvider)
                    ?.update(project.id, UpdateProject(name: name));
                ref.invalidate(_projectsProvider);
                if (ctx.mounted) Navigator.of(ctx).pop();
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(
                      content: Text('Failed: $e'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              }
            },
            child: const Text('Save',
                style: TextStyle(
                    color: AppColors.brand,
                    fontFamily: 'IBM Plex Sans')),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(
      BuildContext context, WidgetRef ref, Project project) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: Text(
          'Delete "${project.name}"?',
          style: const TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: const Text(
          'This will permanently delete the project and all its tasks.',
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
            onPressed: () async {
              try {
                await ref
                    .read(projectsApiProvider)
                    ?.deleteProject(project.id);
                ref.invalidate(_projectsProvider);
                if (ctx.mounted) Navigator.of(ctx).pop();
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(
                      content: Text('Failed: $e'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              }
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

class _ProjectTile extends StatelessWidget {
  const _ProjectTile({
    required this.project,
    required this.onEdit,
    required this.onDelete,
  });

  final Project project;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.folder_rounded,
              color: AppColors.textLow, size: 18),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  project.name,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  'ID: ${project.id}',
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_rounded, size: 16),
            color: AppColors.textLow,
            splashRadius: 16,
            onPressed: onEdit,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, size: 16),
            color: AppColors.error,
            splashRadius: 16,
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
