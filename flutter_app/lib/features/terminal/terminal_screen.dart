import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Screen showing normalized logs for an execution process via WebSocket.
class TerminalScreen extends ConsumerStatefulWidget {
  const TerminalScreen({
    super.key,
    required this.processId,
    this.processName,
  });

  final String processId;
  final String? processName;

  @override
  ConsumerState<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends ConsumerState<TerminalScreen> {
  final _logLines = <String>[];
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  bool _connected = false;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _connect();
  }

  void _connect() {
    final server = ref.read(activeServerProvider);
    if (server == null) return;

    final baseUri = Uri.parse(server.baseUrl);
    final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
    final wsUrl =
        '$wsScheme://${baseUri.host}:${baseUri.port}/api/execution-processes/${widget.processId}/normalized-logs/ws';

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel!.ready.then((_) {
        if (mounted) setState(() => _connected = true);
      });
      _sub = _channel!.stream.listen(
        (data) {
          if (mounted) {
            setState(() {
              _logLines.add(data.toString());
            });
            // Auto-scroll to bottom
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (_scrollController.hasClients) {
                _scrollController.animateTo(
                  _scrollController.position.maxScrollExtent,
                  duration: const Duration(milliseconds: 100),
                  curve: Curves.easeOut,
                );
              }
            });
          }
        },
        onError: (error) {
          if (mounted) {
            setState(() {
              _logLines.add('[ERROR] $error');
              _connected = false;
            });
          }
        },
        onDone: () {
          if (mounted) setState(() => _connected = false);
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _logLines.add('[ERROR] Failed to connect: $e');
        });
      }
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _channel?.sink.close();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D0F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D0F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, size: AppSpacing.iconSizeLg),
          color: AppColors.textNormal,
          splashRadius: 16,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _connected ? AppColors.success : AppColors.error,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              widget.processName ?? 'Process Logs',
              style: const TextStyle(
                color: AppColors.textHigh,
                fontSize: 14,
                fontWeight: FontWeight.w500,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
      ),
      body: _logLines.isEmpty
          ? Center(
              child: Text(
                _connected ? 'Waiting for output...' : 'Disconnected',
                style: const TextStyle(
                  color: AppColors.textLow,
                  fontSize: 13,
                  fontFamily: 'IBM Plex Mono',
                ),
              ),
            )
          : ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: _logLines.length,
              itemBuilder: (context, index) {
                final line = _logLines[index];
                return SelectableText(
                  line,
                  style: const TextStyle(
                    color: AppColors.textNormal,
                    fontSize: 12,
                    fontFamily: 'IBM Plex Mono',
                    height: 1.5,
                  ),
                );
              },
            ),
    );
  }
}
