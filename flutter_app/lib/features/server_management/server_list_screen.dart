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
            onPressed: () => _showAddServerDialog(context, ref),
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
                  : IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 18),
                      color: AppColors.textLow,
                      onPressed: () {
                        ref.read(serverListProvider.notifier).remove(server.id);
                      },
                    ),
              onTap: () {
                ref.read(activeServerProvider.notifier).state = server;
              },
            ),
          );
        },
      ),
    );
  }

  void _showAddServerDialog(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController();
    final urlController = TextEditingController();
    bool isGateway = false;

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AppColors.bgPanel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
          ),
          title: const Text(
            'Add Server',
            style: TextStyle(
              color: AppColors.textHigh,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: InputDecoration(
                  labelText: 'Name',
                  labelStyle: const TextStyle(
                      color: AppColors.textLow, fontSize: 13),
                  enabledBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: AppColors.border),
                    borderRadius:
                        BorderRadius.circular(AppSpacing.borderRadius),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: AppColors.brand),
                    borderRadius:
                        BorderRadius.circular(AppSpacing.borderRadius),
                  ),
                ),
                style: const TextStyle(
                    color: AppColors.textHigh, fontSize: 13),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: urlController,
                decoration: InputDecoration(
                  labelText: 'URL (e.g. http://localhost:3000)',
                  labelStyle: const TextStyle(
                      color: AppColors.textLow, fontSize: 13),
                  enabledBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: AppColors.border),
                    borderRadius:
                        BorderRadius.circular(AppSpacing.borderRadius),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: AppColors.brand),
                    borderRadius:
                        BorderRadius.circular(AppSpacing.borderRadius),
                  ),
                ),
                style: const TextStyle(
                    color: AppColors.textHigh, fontSize: 13),
              ),
              const SizedBox(height: AppSpacing.sm),
              CheckboxListTile(
                value: isGateway,
                onChanged: (v) =>
                    setDialogState(() => isGateway = v ?? false),
                title: const Text(
                  'Gateway mode',
                  style: TextStyle(
                      color: AppColors.textNormal, fontSize: 13),
                ),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
              ),
            ],
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
                final name = nameController.text.trim();
                final url = urlController.text.trim();
                if (name.isEmpty || url.isEmpty) return;
                ref.read(serverListProvider.notifier).add(
                      ServerConfig(
                        id: DateTime.now().millisecondsSinceEpoch.toString(),
                        name: name,
                        baseUrl: url,
                        isGateway: isGateway,
                      ),
                    );
                Navigator.of(ctx).pop();
              },
              child: const Text('Add',
                  style: TextStyle(
                      color: AppColors.brand,
                      fontFamily: 'IBM Plex Sans')),
            ),
          ],
        ),
      ),
    );
  }
}
