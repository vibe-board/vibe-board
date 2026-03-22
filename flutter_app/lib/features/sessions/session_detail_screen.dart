import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/session.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';
import '../../ui/components/empty_state.dart';
import '../../utils/json_patch.dart';
import 'conversation_view.dart';

final _sessionsProvider =
    FutureProvider.family<List<Session>, String>((ref, attemptId) {
  final api = ref.watch(sessionsApiProvider);
  if (api == null) return [];
  return api.getByWorkspace(attemptId);
});

final _executionProcessesStream = StreamProvider.family
    .autoDispose<List<Map<String, dynamic>>, String>((ref, sessionId) {
  final server = ref.watch(activeServerProvider);
  if (server == null) return const Stream.empty();
  final baseUri = Uri.parse(server.baseUrl);
  final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
  final wsUrl =
      '$wsScheme://${baseUri.host}:${baseUri.port}/api/execution-processes/stream/session/ws?session_id=$sessionId';
  return jsonPatchWsStream<List<dynamic>>(
    wsUrl: wsUrl,
    initialData: [],
  ).map((state) {
    if (state.error != null && !state.isInitialized) {
      throw Exception(state.error!);
    }
    return state.data.cast<Map<String, dynamic>>();
  });
});

final _conversationProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, sessionId) {
  final api = ref.watch(sessionsApiProvider);
  if (api == null) return [];
  return api.getConversation(sessionId).then(
    (entries) => entries.map((e) => {
      'id': e.id,
      'session_id': e.sessionId,
      'role': e.role,
      'content': e.content,
      'created_at': e.createdAt,
    }).toList(),
  );
});

class SessionDetailScreen extends ConsumerWidget {
  const SessionDetailScreen({
    super.key,
    required this.projectId,
    required this.taskId,
    required this.attemptId,
  });

  final String projectId;
  final String taskId;
  final String attemptId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(_sessionsProvider(attemptId));

    return Scaffold(
      backgroundColor: AppColors.bgBase,
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => context.go('/projects/$projectId/tasks/$taskId'),
        ),
        title: const Text(
          'Sessions',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: sessionsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.error_outline_rounded,
          title: 'Failed to load sessions',
          description: error.toString(),
        ),
        data: (sessions) {
          if (sessions.isEmpty) {
            return const EmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No sessions yet',
              description: 'Sessions will appear here once the agent starts working.',
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: sessions.length,
            itemBuilder: (context, index) {
              final session = sessions[index];
              return _SessionTile(
                session: session,
                onTap: () => _showSessionDetail(context, ref, session),
              );
            },
          );
        },
      ),
    );
  }

  void _showSessionDetail(BuildContext context, WidgetRef ref, Session session) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgBase,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        builder: (ctx, scrollController) => _SessionDetailSheet(
          session: session,
          projectId: projectId,
          taskId: taskId,
          scrollController: scrollController,
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session, required this.onTap});
  final Session session;
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
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (session.executor != null) ...[
                        AppBadge(
                          label: session.executor!,
                          color: AppColors.brand,
                        ),
                        const SizedBox(width: AppSpacing.sm),
                      ],
                      Text(
                        _formatTimeAgo(session.createdAt),
                        style: const TextStyle(
                          color: AppColors.textLow,
                          fontSize: 12,
                          fontFamily: 'IBM Plex Sans',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    session.id,
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono',
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.textLow),
          ],
        ),
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

class _SessionDetailSheet extends ConsumerWidget {
  const _SessionDetailSheet({
    required this.session,
    required this.projectId,
    required this.taskId,
    required this.scrollController,
  });

  final Session session;
  final String projectId;
  final String taskId;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final processesAsync = ref.watch(_executionProcessesStream(session.id));
    final conversationAsync = ref.watch(_conversationProvider(session.id));

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.all(AppSpacing.xl),
      children: [
        // Handle bar
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

        // Session header
        Row(
          children: [
            const Text(
              'Session',
              style: TextStyle(
                color: AppColors.textHigh,
                fontSize: 18,
                fontWeight: FontWeight.w600,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
            const Spacer(),
            if (session.executor != null)
              AppBadge(
                label: session.executor!,
                color: AppColors.brand,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Created ${_formatTimeAgo(session.createdAt)}',
          style: const TextStyle(
            color: AppColors.textLow,
            fontSize: 12,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        // Execution processes
        const Text(
          'Execution Processes',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        processesAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
          error: (error, _) => Text(
            'Failed to load processes: $error',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
          data: (processes) {
            if (processes.isEmpty) {
              return Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.xl),
                decoration: BoxDecoration(
                  color: AppColors.bgSurface,
                  borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text(
                  'No execution processes yet.',
                  style: TextStyle(
                    color: AppColors.textLow,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Sans',
                  ),
                  textAlign: TextAlign.center,
                ),
              );
            }
            return Column(
              children: processes
                  .map((p) => _ProcessTile(process: p, sessionId: session.id))
                  .toList(),
            );
          },
        ),
        const SizedBox(height: AppSpacing.xl),

        // Conversation
        const Text(
          'Conversation',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        conversationAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
          error: (error, _) => Text(
            'Failed to load conversation: $error',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
          data: (entries) => ConversationView(entries: entries),
        ),
        const SizedBox(height: AppSpacing.xl),

        // Follow-up input
        _FollowUpInput(sessionId: session.id),
      ],
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

class _ProcessTile extends StatelessWidget {
  const _ProcessTile({required this.process, required this.sessionId});
  final Map<String, dynamic> process;
  final String sessionId;

  @override
  Widget build(BuildContext context) {
    final status = process['status'] as String? ?? 'running';
    final runReason = process['run_reason'] as String? ?? '';
    final exitCode = process['exit_code'];
    final startedAt = process['started_at'] as String? ?? '';

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'completed':
        statusColor = AppColors.success;
        statusIcon = Icons.check_circle_rounded;
      case 'failed':
        statusColor = AppColors.error;
        statusIcon = Icons.cancel_rounded;
      case 'killed':
        statusColor = AppColors.warning;
        statusIcon = Icons.stop_circle_rounded;
      default:
        statusColor = AppColors.brand;
        statusIcon = Icons.play_circle_rounded;
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
          Icon(statusIcon, color: statusColor, size: 18),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  runReason,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                if (startedAt.isNotEmpty)
                  Text(
                    _formatTimeAgo(startedAt),
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
              ],
            ),
          ),
          AppBadge(
            label: status,
            color: statusColor,
          ),
          if (exitCode != null) ...[
            const SizedBox(width: AppSpacing.sm),
            Text(
              'exit: $exitCode',
              style: const TextStyle(
                color: AppColors.textLow,
                fontSize: 11,
                fontFamily: 'IBM Plex Mono',
              ),
            ),
          ],
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

class _FollowUpInput extends ConsumerStatefulWidget {
  const _FollowUpInput({required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<_FollowUpInput> createState() => _FollowUpInputState();
}

class _FollowUpInputState extends ConsumerState<_FollowUpInput> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    try {
      final api = ref.read(sessionsApiProvider);
      await api?.followUp(widget.sessionId, {'message': text});
      _controller.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'Send a follow-up message...',
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
              ),
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 13,
                fontFamily: 'IBM Plex Sans',
              ),
              maxLines: null,
              onSubmitted: (_) => _send(),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          IconButton(
            icon: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.brand,
                    ),
                  )
                : const Icon(Icons.send_rounded, size: 18),
            color: AppColors.brand,
            onPressed: _sending ? null : _send,
          ),
        ],
      ),
    );
  }
}
