import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../core/api/api_providers.dart';

class ServerListScreen extends ConsumerWidget {
  const ServerListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final servers = ref.watch(serverListProvider);
    final activeServer = ref.watch(activeServerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Servers'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              // TODO: add server dialog
            },
          ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: servers.length,
        itemBuilder: (context, index) {
          final server = servers[index];
          final isActive = server.id == activeServer?.id;
          return Card(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: ListTile(
              leading: Icon(
                server.isGateway ? Icons.vpn_lock_rounded : Icons.dns_rounded,
                color: isActive ? AppColors.brand : AppColors.textLow,
              ),
              title: Text(
                server.name,
                style: TextStyle(
                  color: AppColors.textHigh,
                  fontWeight: FontWeight.w500,
                ),
              ),
              subtitle: Text(
                server.baseUrl,
                style: TextStyle(color: AppColors.textLow, fontSize: 12),
              ),
              trailing: isActive
                  ? const Icon(Icons.check_circle_rounded,
                      color: AppColors.brand, size: 18)
                  : null,
              onTap: () {
                ref.read(activeServerProvider.notifier).state = server;
              },
            ),
          );
        },
      ),
    );
  }
}
