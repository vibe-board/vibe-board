import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/conversation.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';
import '../../ui/components/empty_state.dart';

final _queueStatusProvider =
    FutureProvider.family<QueueStatus, String>((ref, sessionId) {
  final api = ref.watch(queueApiProvider);
  if (api == null) return const QueueStatus(messages: []);
  return api.getStatus(sessionId);
});

class QueueScreen extends ConsumerWidget {
  const QueueScreen({
    super.key,
    required this.sessionId,
  });

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queueAsync = ref.watch(_queueStatusProvider(sessionId));

    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Message Queue',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: queueAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load queue',
          description: error.toString(),
        ),
        data: (status) {
          if (status.messages.isEmpty) {
            return const EmptyState(
              icon: Icons.queue_rounded,
              title: 'Queue is empty',
              description: 'No messages queued for this session.',
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: status.messages.length,
            itemBuilder: (context, index) {
              return _QueueTile(
                message: status.messages[index],
                onCancel: () => _cancelMessage(context, ref),
              );
            },
          );
        },
      ),
    );
  }

  void _cancelMessage(BuildContext context, WidgetRef ref) async {
    try {
      final api = ref.read(queueApiProvider);
      await api?.cancel(sessionId);
      ref.invalidate(_queueStatusProvider(sessionId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to cancel: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }
}

class _QueueTile extends StatelessWidget {
  const _QueueTile({required this.message, required this.onCancel});
  final QueuedMessage message;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    switch (message.status) {
      case 'pending':
        statusColor = AppColors.warning;
      case 'processing':
        statusColor = AppColors.brand;
      case 'completed':
        statusColor = AppColors.success;
      case 'cancelled':
        statusColor = AppColors.textLow;
      default:
        statusColor = AppColors.textLow;
    }

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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.message,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Sans',
                  ),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    AppBadge(label: message.status, color: statusColor),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      _formatTimeAgo(message.createdAt),
                      style: const TextStyle(
                        color: AppColors.textLow,
                        fontSize: 11,
                        fontFamily: 'IBM Plex Sans',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (message.status == 'pending')
            IconButton(
              icon: const Icon(Icons.cancel_outlined, size: 18),
              color: AppColors.error,
              tooltip: 'Cancel',
              onPressed: onCancel,
            ),
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
