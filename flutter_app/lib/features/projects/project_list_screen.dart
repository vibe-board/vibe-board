import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/project.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_button.dart';
import '../../ui/components/app_text_field.dart';
import '../../ui/components/app_dialog.dart';
import '../../ui/components/empty_state.dart';
import '../../utils/json_patch.dart';

/// Projects list fetched from the active server with WebSocket streaming.
final projectsProvider = StreamProvider<List<Project>>((ref) {
  final api = ref.watch(projectsApiProvider);
  if (api == null) return Stream.value([]);

  final server = ref.watch(activeServerProvider);
  if (server == null) return Stream.value([]);

  final baseUri = Uri.parse(server.baseUrl);
  final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
  final wsUrl =
      '$wsScheme://${baseUri.host}:${baseUri.port}/api/projects/stream/ws';

  return jsonPatchWsStream<List<dynamic>>(
    wsUrl: wsUrl,
    initialData: [],
  ).map((state) {
    if (state.error != null && !state.isInitialized) {
      throw Exception(state.error!);
    }
    return state.data
        .map((j) => Project.fromJson(j as Map<String, dynamic>))
        .toList();
  });
});

class ProjectListScreen extends ConsumerWidget {
  const ProjectListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(projectsProvider);
    final activeServer = ref.watch(activeServerProvider);

    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        title: Text(
          'Projects',
          style: const TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          if (activeServer != null)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xxs,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.bgElevated,
                    borderRadius:
                        BorderRadius.circular(AppSpacing.borderRadius),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    activeServer.name,
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                ),
              ),
            ),
          IconButton(
            icon: const Icon(Icons.add_rounded,
                size: AppSpacing.iconSizeLg),
            color: AppColors.textNormal,
            splashRadius: 16,
            onPressed: () => _showCreateProjectDialog(context, ref),
          ),
        ],
      ),
      body: projectsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load projects',
          description: error.toString(),
        ),
        data: (projects) {
          if (projects.isEmpty) {
            return EmptyState(
              icon: Icons.dashboard_rounded,
              title: 'No projects yet',
              description: 'Create a project to get started',
              actionLabel: 'New Project',
              onAction: () => _showCreateProjectDialog(context, ref),
            );
          }
          return _ProjectGrid(projects: projects);
        },
      ),
    );
  }

  void _showCreateProjectDialog(BuildContext context, WidgetRef ref) {
    showAppDialog<void>(
      context: context,
      title: 'New Project',
      child: _CreateProjectForm(
        onCreated: (project) {
          ref.invalidate(projectsProvider);
          context.pop();
          context.push('/projects/${project.id}/tasks');
        },
      ),
    );
  }
}

class _ProjectGrid extends StatelessWidget {
  const _ProjectGrid({required this.projects});
  final List<Project> projects;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth > 1200
            ? 4
            : constraints.maxWidth > 800
                ? 3
                : constraints.maxWidth > 500
                    ? 2
                    : 1;
        return GridView.builder(
          padding: const EdgeInsets.all(AppSpacing.xl),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: AppSpacing.md,
            crossAxisSpacing: AppSpacing.md,
            childAspectRatio: 3.2,
          ),
          itemCount: projects.length,
          itemBuilder: (context, index) =>
              _ProjectCard(project: projects[index]),
        );
      },
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.bgSurface,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
      child: InkWell(
        onTap: () => context.push('/projects/${project.id}/tasks'),
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        hoverColor: AppColors.hover,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius:
                BorderRadius.circular(AppSpacing.borderRadiusLg),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.brandMuted,
                  borderRadius:
                      BorderRadius.circular(AppSpacing.borderRadius),
                ),
                child: const Center(
                  child: Text(
                    'P',
                    style: TextStyle(
                      color: AppColors.brand,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      project.name,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        fontFamily: 'IBM Plex Sans',
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      _formatDate(project.createdAt),
                      style: const TextStyle(
                        color: AppColors.textLow,
                        fontSize: 12,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz_rounded,
                    size: AppSpacing.iconSize, color: AppColors.textLow),
                color: AppColors.bgElevated,
                shape: RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.circular(AppSpacing.borderRadius),
                  side: const BorderSide(color: AppColors.border),
                ),
                padding: EdgeInsets.zero,
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: Text('Edit',
                        style: TextStyle(
                            color: AppColors.textNormal,
                            fontFamily: 'IBM Plex Sans',
                            fontSize: 13)),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text('Delete',
                        style: TextStyle(
                            color: AppColors.error,
                            fontFamily: 'IBM Plex Sans',
                            fontSize: 13)),
                  ),
                ],
                onSelected: (value) {
                  if (value == 'delete') {
                    _confirmDelete(context);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays < 1) return 'Today';
    if (diff.inDays < 2) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  void _confirmDelete(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius:
              BorderRadius.circular(AppSpacing.borderRadiusLg),
        ),
        title: const Text(
          'Delete project?',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        content: Text(
          '"${project.name}" and all its tasks will be permanently deleted.',
          style: const TextStyle(
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
              final api = container.read(projectsApiProvider);
              api?.deleteProject(project.id).then((_) {
                container.invalidate(projectsProvider);
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

class _CreateProjectForm extends StatefulWidget {
  const _CreateProjectForm({required this.onCreated});
  final ValueChanged<Project> onCreated;

  @override
  State<_CreateProjectForm> createState() => _CreateProjectFormState();
}

class _CreateProjectFormState extends State<_CreateProjectForm> {
  final _nameController = TextEditingController();
  final _repoPathController = TextEditingController();
  final _repoNameController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _repoPathController.dispose();
    _repoNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          controller: _nameController,
          hintText: 'Project name',
          autofocus: true,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _repoPathController,
          hintText: 'Git repository path (e.g. /home/user/project)',
        ),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: _repoNameController,
          hintText: 'Repository display name (optional)',
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
          label: _loading ? 'Creating...' : 'Create Project',
          onPressed: _loading ? null : _submit,
          fullWidth: true,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Project name is required');
      return;
    }
    final repoPath = _repoPathController.text.trim();
    if (repoPath.isEmpty) {
      setState(() => _error = 'Repository path is required');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final container = ProviderScope.containerOf(context);
      final api = container.read(projectsApiProvider);
      if (api == null) {
        setState(() {
          _error = 'No server connected';
          _loading = false;
        });
        return;
      }

      final repoName = _repoNameController.text.trim();
      final project = await api.create(
        CreateProject(
          name: name,
          repositories: [
            CreateProjectRepo(
              displayName: repoName.isNotEmpty ? repoName : name,
              gitRepoPath: repoPath,
            ),
          ],
        ),
      );
      widget.onCreated(project);
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }
}
