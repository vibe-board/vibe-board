import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _mcpConfigProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.watch(configApiProvider);
  if (api == null) throw Exception('No server connected');
  return api.getMcpServers();
});

class McpServersScreen extends ConsumerWidget {
  const McpServersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync = ref.watch(_mcpConfigProvider);

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
          'MCP Servers',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: configAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => Center(
          child: Text(
            'Failed to load MCP config: $error',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
        ),
        data: (config) {
          final servers = config['mcpServers'] as Map<String, dynamic>?;
          if (servers == null || servers.isEmpty) {
            return const Center(
              child: Text(
                'No MCP servers configured.',
                style: TextStyle(color: AppColors.textLow, fontSize: 13),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: servers.length,
            itemBuilder: (context, index) {
              final entry = servers.entries.toList()[index];
              return _McpServerTile(name: entry.key, config: entry.value);
            },
          );
        },
      ),
    );
  }
}

class _McpServerTile extends StatelessWidget {
  const _McpServerTile({required this.name, required this.config});
  final String name;
  final dynamic config;

  @override
  Widget build(BuildContext context) {
    final cfg = config is Map<String, dynamic> ? config as Map<String, dynamic> : <String, dynamic>{};
    final command = cfg['command'] as String? ?? '';
    final args = cfg['args'] as List<dynamic>?;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.extension_rounded, color: AppColors.brand, size: 16),
              const SizedBox(width: AppSpacing.sm),
              Text(
                name,
                style: const TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ],
          ),
          if (command.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              [command, if (args != null) args.join(' ')].join(' '),
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
}
