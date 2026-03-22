import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';

enum DiffViewMode { unified, split }

final _diffProvider = FutureProvider.family<Map<String, dynamic>, (String, String)>(
  (ref, params) {
    final (attemptId, sha) = params;
    final api = ref.watch(attemptsApiProvider);
    if (api == null) throw Exception('No server connected');
    return api.getCommitDiff(attemptId, sha);
  },
);

class DiffViewerScreen extends ConsumerStatefulWidget {
  const DiffViewerScreen({
    super.key,
    required this.projectId,
    required this.taskId,
    required this.attemptId,
    this.sha,
  });

  final String projectId;
  final String taskId;
  final String attemptId;
  final String? sha;

  @override
  ConsumerState<DiffViewerScreen> createState() => _DiffViewerScreenState();
}

class _DiffViewerScreenState extends ConsumerState<DiffViewerScreen> {
  DiffViewMode _mode = DiffViewMode.unified;

  @override
  Widget build(BuildContext context) {
    final diffAsync = widget.sha != null
        ? ref.watch(_diffProvider((widget.attemptId, widget.sha!)))
        : null;

    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => context.go(
            '/projects/${widget.projectId}/tasks/${widget.taskId}',
          ),
        ),
        title: const Text(
          'Diff',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _mode == DiffViewMode.unified
                  ? Icons.view_stream_rounded
                  : Icons.view_column_rounded,
              size: AppSpacing.iconSizeLg,
            ),
            color: AppColors.textLow,
            splashRadius: 16,
            onPressed: () {
              setState(() {
                _mode = _mode == DiffViewMode.unified
                    ? DiffViewMode.split
                    : DiffViewMode.unified;
              });
            },
          ),
        ],
      ),
      body: diffAsync == null
          ? const Center(
              child: Text(
                'No commit selected',
                style: TextStyle(color: AppColors.textLow, fontSize: 13),
              ),
            )
          : diffAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
              error: (error, _) => Center(
                child: Text(
                  'Failed to load diff: $error',
                  style: const TextStyle(color: AppColors.error, fontSize: 13),
                ),
              ),
              data: (diff) => _DiffContent(diff: diff, mode: _mode),
            ),
    );
  }
}

class _DiffContent extends StatelessWidget {
  const _DiffContent({required this.diff, required this.mode});
  final Map<String, dynamic> diff;
  final DiffViewMode mode;

  @override
  Widget build(BuildContext context) {
    final files = diff['files'] as List<dynamic>? ?? [];
    final stats = diff['stats'] as Map<String, dynamic>?;

    return Column(
      children: [
        // Stats bar
        if (stats != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.sm,
            ),
            color: AppColors.bgSurface,
            child: Row(
              children: [
                Text(
                  '${files.length} file${files.length == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: AppColors.textNormal,
                    fontSize: 12,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                const SizedBox(width: AppSpacing.lg),
                Text(
                  '+${stats['additions'] ?? 0}',
                  style: const TextStyle(
                    color: AppColors.success,
                    fontSize: 12,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  '-${stats['deletions'] ?? 0}',
                  style: const TextStyle(
                    color: AppColors.error,
                    fontSize: 12,
                    fontFamily: 'IBM Plex Mono',
                  ),
                ),
              ],
            ),
          ),
        // File list
        Expanded(
          child: files.isEmpty
              ? const Center(
                  child: Text(
                    'No file changes',
                    style: TextStyle(color: AppColors.textLow, fontSize: 13),
                  ),
                )
              : ListView.builder(
                  itemCount: files.length,
                  itemBuilder: (context, index) {
                    final file = files[index] as Map<String, dynamic>;
                    return _FileDiffTile(file: file, mode: mode);
                  },
                ),
        ),
      ],
    );
  }
}

class _FileDiffTile extends StatefulWidget {
  const _FileDiffTile({required this.file, required this.mode});
  final Map<String, dynamic> file;
  final DiffViewMode mode;

  @override
  State<_FileDiffTile> createState() => _FileDiffTileState();
}

class _FileDiffTileState extends State<_FileDiffTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final path = widget.file['path'] as String? ?? 'unknown';
    final status = widget.file['status'] as String? ?? 'modified';
    final hunks = widget.file['hunks'] as List<dynamic>? ?? [];

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'added':
        statusColor = AppColors.success;
        statusIcon = Icons.add_circle_outline_rounded;
      case 'deleted':
        statusColor = AppColors.error;
        statusIcon = Icons.remove_circle_outline_rounded;
      case 'renamed':
        statusColor = AppColors.warning;
        statusIcon = Icons.drive_file_rename_outline_rounded;
      default:
        statusColor = AppColors.textLow;
        statusIcon = Icons.edit_rounded;
    }

    return Container(
      margin: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          // File header
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Icon(statusIcon, size: 14, color: statusColor),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      path,
                      style: const TextStyle(
                        color: AppColors.textHigh,
                        fontSize: 12,
                        fontFamily: 'IBM Plex Mono',
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  AppBadge(
                    label: status,
                    color: statusColor,
                    bgColor: statusColor.withValues(alpha: 0.15),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 18,
                    color: AppColors.textLow,
                  ),
                ],
              ),
            ),
          ),
          // Hunks
          if (_expanded)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: AppColors.border),
                ),
              ),
              child: hunks.isEmpty
                  ? const Text(
                      'Binary file or no diff content',
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontFamily: 'IBM Plex Sans',
                        fontStyle: FontStyle.italic,
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: hunks.map((hunk) {
                        final h = hunk as Map<String, dynamic>;
                        final header = h['header'] as String? ?? '';
                        final lines = h['lines'] as List<dynamic>? ?? [];
                        return _HunkView(header: header, lines: lines, mode: widget.mode);
                      }).toList(),
                    ),
            ),
        ],
      ),
    );
  }
}

class _HunkView extends StatelessWidget {
  const _HunkView({required this.header, required this.lines, required this.mode});
  final String header;
  final List<dynamic> lines;
  final DiffViewMode mode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Hunk header
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          color: AppColors.bgPanel,
          child: Text(
            header,
            style: const TextStyle(
              color: AppColors.brandText,
              fontSize: 11,
              fontFamily: 'IBM Plex Mono',
            ),
          ),
        ),
        // Diff lines
        ...lines.map((line) {
          final l = line as Map<String, dynamic>;
          final type = l['type'] as String? ?? 'context';
          final content = l['content'] as String? ?? '';

          Color bgColor;
          Color textColor;
          String prefix;

          switch (type) {
            case 'addition':
              bgColor = AppColors.successMuted;
              textColor = AppColors.success;
              prefix = '+';
            case 'deletion':
              bgColor = AppColors.errorMuted;
              textColor = AppColors.error;
              prefix = '-';
            default:
              bgColor = Colors.transparent;
              textColor = AppColors.textLow;
              prefix = ' ';
          }

          return Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xxs,
            ),
            color: bgColor,
            child: Text(
              '$prefix$content',
              style: TextStyle(
                color: textColor,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono',
                height: 1.4,
              ),
            ),
          );
        }),
      ],
    );
  }
}
