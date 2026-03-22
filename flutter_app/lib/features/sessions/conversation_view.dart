import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Renders a list of conversation entries (user messages, assistant responses, tool calls).
class ConversationView extends StatelessWidget {
  const ConversationView({super.key, required this.entries});

  final List<Map<String, dynamic>> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.xl),
        decoration: BoxDecoration(
          color: AppColors.bgSurface,
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
          border: Border.all(color: AppColors.border),
        ),
        child: const Text(
          'No conversation yet.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.textLow,
            fontSize: 13,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: entries.map((entry) => _ConversationEntryTile(entry: entry)).toList(),
    );
  }
}

class _ConversationEntryTile extends StatelessWidget {
  const _ConversationEntryTile({required this.entry});
  final Map<String, dynamic> entry;

  @override
  Widget build(BuildContext context) {
    final role = entry['role'] as String? ?? 'unknown';
    final content = entry['content'];

    Color roleColor;
    IconData roleIcon;
    String roleLabel;

    switch (role) {
      case 'user':
        roleColor = AppColors.brand;
        roleIcon = Icons.person_rounded;
        roleLabel = 'User';
      case 'assistant':
        roleColor = AppColors.statusInProgress;
        roleIcon = Icons.smart_toy_rounded;
        roleLabel = 'Assistant';
      case 'tool':
        roleColor = AppColors.warning;
        roleIcon = Icons.build_rounded;
        roleLabel = 'Tool';
      default:
        roleColor = AppColors.textLow;
        roleIcon = Icons.circle;
        roleLabel = role;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Role header
          Row(
            children: [
              Icon(roleIcon, size: 14, color: roleColor),
              const SizedBox(width: AppSpacing.xs),
              Text(
                roleLabel,
                style: TextStyle(
                  color: roleColor,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
              const Spacer(),
              Text(
                _formatTimeAgo(entry['created_at'] as String? ?? ''),
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 10,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          // Content
          if (content is String)
            _renderTextContent(content)
          else if (content is Map)
            _renderMapContent(Map<String, dynamic>.from(content))
          else if (content is List)
            _renderListContent(content)
          else
            Text(
              content?.toString() ?? 'null',
              style: const TextStyle(
                color: AppColors.textNormal,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
        ],
      ),
    );
  }

  Widget _renderTextContent(String text) {
    if (text.contains('```') || text.contains('**') || text.contains('## ')) {
      return MarkdownBody(
        data: text,
        styleSheet: MarkdownStyleSheet(
          p: const TextStyle(color: AppColors.textNormal, fontSize: 13, fontFamily: 'IBM Plex Sans', height: 1.5),
          code: const TextStyle(color: AppColors.brandText, fontSize: 12, fontFamily: 'IBM Plex Mono', backgroundColor: AppColors.bgPanel),
          codeblockDecoration: BoxDecoration(
            color: AppColors.bgPanel,
            borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
          ),
          h1: const TextStyle(color: AppColors.textHigh, fontSize: 16, fontWeight: FontWeight.w600),
          h2: const TextStyle(color: AppColors.textHigh, fontSize: 14, fontWeight: FontWeight.w600),
          h3: const TextStyle(color: AppColors.textHigh, fontSize: 13, fontWeight: FontWeight.w600),
          blockquote: const TextStyle(color: AppColors.textLow, fontStyle: FontStyle.italic),
          listBullet: const TextStyle(color: AppColors.textNormal),
        ),
        selectable: true,
      );
    }
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.textNormal,
        fontSize: 13,
        fontFamily: 'IBM Plex Sans',
        height: 1.5,
      ),
    );
  }

  Widget _renderMapContent(Map<String, dynamic> map) {
    // Handle tool_use content blocks
    if (map.containsKey('type') && map['type'] == 'tool_use') {
      return _ToolUseBlock(
        toolName: map['name'] as String? ?? 'unknown',
        input: map['input'],
      );
    }
    // Handle tool_result content blocks
    if (map.containsKey('type') && map['type'] == 'tool_result') {
      return _ToolResultBlock(
        content: map['content'],
        isError: map['is_error'] as bool? ?? false,
      );
    }

    // Generic map rendering
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
      ),
      child: Text(
        map.toString(),
        style: const TextStyle(
          color: AppColors.textNormal,
          fontSize: 12,
          fontFamily: 'IBM Plex Mono',
        ),
      ),
    );
  }

  Widget _renderListContent(List<dynamic> list) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: list.map((item) {
        if (item is Map<String, dynamic>) {
          return _renderMapContent(item);
        }
        return Text(
          item.toString(),
          style: const TextStyle(
            color: AppColors.textNormal,
            fontSize: 13,
            fontFamily: 'IBM Plex Sans',
          ),
        );
      }).toList(),
    );
  }

  String _formatTimeAgo(String iso) {
    if (iso.isEmpty) return '';
    final date = DateTime.tryParse(iso);
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

class _ToolUseBlock extends StatelessWidget {
  const _ToolUseBlock({required this.toolName, this.input});
  final String toolName;
  final dynamic input;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.build_rounded, size: 12, color: AppColors.warning),
              const SizedBox(width: AppSpacing.xs),
              Text(
                toolName,
                style: const TextStyle(
                  color: AppColors.warning,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Mono',
                ),
              ),
            ],
          ),
          if (input != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              input.toString(),
              style: const TextStyle(
                color: AppColors.textLow,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono',
              ),
              maxLines: 5,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class _ToolResultBlock extends StatelessWidget {
  const _ToolResultBlock({this.content, required this.isError});
  final dynamic content;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color = isError ? AppColors.error : AppColors.success;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: isError ? AppColors.errorMuted : AppColors.successMuted,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isError ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded,
                size: 12,
                color: color,
              ),
              const SizedBox(width: AppSpacing.xs),
              Text(
                isError ? 'Error' : 'Result',
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
          if (content != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              content.toString(),
              style: TextStyle(
                color: isError ? AppColors.error : AppColors.textNormal,
                fontSize: 12,
                fontFamily: 'IBM Plex Mono',
              ),
              maxLines: 10,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}
