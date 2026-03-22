import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/repo.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _reposProvider = FutureProvider<List<Repo>>((ref) async {
  final api = ref.watch(reposApiProvider);
  if (api == null) return [];
  return api.list();
});

class ReposSettingsScreen extends ConsumerWidget {
  const ReposSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reposAsync = ref.watch(_reposProvider);

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
          'Repositories',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: reposAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand)),
        error: (error, _) => Center(
          child: Text('Error: $error',
              style: const TextStyle(color: AppColors.error)),
        ),
        data: (repos) {
          if (repos.isEmpty) {
            return const Center(
              child: Text('No repositories',
                  style: TextStyle(color: AppColors.textLow)),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.xl),
            itemCount: repos.length,
            itemBuilder: (context, index) {
              final repo = repos[index];
              return _RepoTile(
                repo: repo,
                onTap: () => _showRepoDetail(context, ref, repo),
              );
            },
          );
        },
      ),
    );
  }

  void _showRepoDetail(BuildContext context, WidgetRef ref, Repo repo) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgBase,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (ctx, scrollController) =>
            _RepoDetailSheet(repo: repo, scrollController: scrollController),
      ),
    );
  }
}

class _RepoTile extends StatelessWidget {
  const _RepoTile({required this.repo, required this.onTap});
  final Repo repo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.bgSurface,
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.source_rounded,
                color: AppColors.textLow, size: 18),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    repo.displayName,
                    style: const TextStyle(
                      color: AppColors.textHigh,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                  Text(
                    repo.path,
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono',
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                size: 18, color: AppColors.textLow),
          ],
        ),
      ),
    );
  }
}

class _RepoDetailSheet extends ConsumerStatefulWidget {
  const _RepoDetailSheet({
    required this.repo,
    required this.scrollController,
  });

  final Repo repo;
  final ScrollController scrollController;

  @override
  ConsumerState<_RepoDetailSheet> createState() => _RepoDetailSheetState();
}

class _RepoDetailSheetState extends ConsumerState<_RepoDetailSheet> {
  late TextEditingController _nameController;
  late TextEditingController _setupScriptController;
  late TextEditingController _cleanupScriptController;
  late TextEditingController _devServerScriptController;
  late TextEditingController _copyFilesController;
  bool _parallelSetup = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final repo = widget.repo;
    _nameController = TextEditingController(text: repo.displayName);
    _setupScriptController = TextEditingController(text: repo.setupScript ?? '');
    _cleanupScriptController =
        TextEditingController(text: repo.cleanupScript ?? '');
    _devServerScriptController =
        TextEditingController(text: repo.devServerScript ?? '');
    _copyFilesController = TextEditingController(text: repo.copyFiles ?? '');
    _parallelSetup = repo.parallelSetupScript;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _setupScriptController.dispose();
    _cleanupScriptController.dispose();
    _devServerScriptController.dispose();
    _copyFilesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(reposApiProvider);
      if (api != null) {
        await api.update(
          widget.repo.id,
          UpdateRepo(
            displayName: _nameController.text.trim(),
            setupScript: _setupScriptController.text.trim().isEmpty
                ? null
                : _setupScriptController.text.trim(),
            cleanupScript: _cleanupScriptController.text.trim().isEmpty
                ? null
                : _cleanupScriptController.text.trim(),
            devServerScript: _devServerScriptController.text.trim().isEmpty
                ? null
                : _devServerScriptController.text.trim(),
            copyFiles: _copyFilesController.text.trim().isEmpty
                ? null
                : _copyFilesController.text.trim(),
            parallelSetupScript: _parallelSetup,
          ),
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Repo updated'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(AppSpacing.xl),
      children: [
        // Handle
        Center(
          child: Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),

        Row(
          children: [
            const Expanded(
              child: Text(
                'Repository Settings',
                style: TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ),
            if (_saving)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppColors.brand),
              )
            else
              IconButton(
                icon: const Icon(Icons.check_rounded, size: 20),
                color: AppColors.brand,
                onPressed: _save,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),

        _FieldLabel(label: 'Display Name'),
        _TextField(controller: _nameController, hint: 'Repository name'),
        const SizedBox(height: AppSpacing.lg),

        _FieldLabel(label: 'Setup Script'),
        _TextField(
            controller: _setupScriptController,
            hint: 'e.g. npm install',
            multiline: true),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Switch(
              value: _parallelSetup,
              onChanged: (v) => setState(() => _parallelSetup = v),
              activeColor: AppColors.brand,
            ),
            const SizedBox(width: AppSpacing.sm),
            const Text(
              'Run setup in parallel',
              style: TextStyle(
                color: AppColors.textNormal,
                fontSize: 12,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),

        _FieldLabel(label: 'Dev Server Script'),
        _TextField(
            controller: _devServerScriptController,
            hint: 'e.g. npm run dev',
            multiline: true),
        const SizedBox(height: AppSpacing.lg),

        _FieldLabel(label: 'Cleanup Script'),
        _TextField(
            controller: _cleanupScriptController,
            hint: 'e.g. rm -rf node_modules',
            multiline: true),
        const SizedBox(height: AppSpacing.lg),

        _FieldLabel(label: 'Copy Files'),
        _TextField(
            controller: _copyFilesController,
            hint: 'Files to copy (newline separated)',
            multiline: true),
        const SizedBox(height: AppSpacing.xl),

        // Info
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: AppColors.bgSurface,
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _InfoRow(label: 'Path', value: widget.repo.path),
              _InfoRow(label: 'ID', value: widget.repo.id),
              if (widget.repo.defaultTargetBranch != null)
                _InfoRow(
                    label: 'Default Branch',
                    value: widget.repo.defaultTargetBranch!),
            ],
          ),
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.textLow,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.hint,
    this.multiline = false,
  });

  final TextEditingController controller;
  final String hint;
  final bool multiline;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: TextField(
        controller: controller,
        maxLines: multiline ? null : 1,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: AppColors.textLow, fontSize: 13),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: const EdgeInsets.all(AppSpacing.md),
          isDense: true,
        ),
        style: const TextStyle(
          color: AppColors.textHigh,
          fontSize: 13,
          fontFamily: 'IBM Plex Mono',
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textLow,
                fontSize: 11,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppColors.textNormal,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono',
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
