import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

/// Controls for running setup, cleanup, and archive scripts on an attempt.
class ScriptControls extends ConsumerWidget {
  const ScriptControls({
    super.key,
    required this.attemptId,
    this.onScriptStarted,
  });

  final String attemptId;
  final VoidCallback? onScriptStarted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Scripts',
            style: TextStyle(
              color: AppColors.textHigh,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFamily: 'IBM Plex Sans',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _ScriptTile(
            icon: Icons.settings_rounded,
            label: 'Setup',
            description: 'Run agent setup script',
            onTap: () => _runScript(context, ref, 'setup'),
          ),
          const Divider(height: 1),
          _ScriptTile(
            icon: Icons.cleaning_services_rounded,
            label: 'Cleanup',
            description: 'Run cleanup script',
            onTap: () => _runScript(context, ref, 'cleanup'),
          ),
          const Divider(height: 1),
          _ScriptTile(
            icon: Icons.archive_rounded,
            label: 'Archive',
            description: 'Run archive script',
            onTap: () => _runScript(context, ref, 'archive'),
          ),
          const Divider(height: 1),
          _ScriptTile(
            icon: Icons.smart_toy_rounded,
            label: 'Agent Setup',
            description: 'Run agent setup',
            onTap: () => _runScript(context, ref, 'agent'),
          ),
        ],
      ),
    );
  }

  Future<void> _runScript(
      BuildContext context, WidgetRef ref, String type) async {
    final api = ref.read(attemptsApiProvider);
    if (api == null) return;

    try {
      switch (type) {
        case 'setup':
          await api.runSetupScript(attemptId);
        case 'cleanup':
          await api.runCleanupScript(attemptId);
        case 'archive':
          await api.runArchiveScript(attemptId);
        case 'agent':
          await api.runAgentSetup(attemptId);
      }
      onScriptStarted?.call();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$type script started'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to start script: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }
}

class _ScriptTile extends StatelessWidget {
  const _ScriptTile({
    required this.icon,
    required this.label,
    required this.description,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Icon(icon, size: 16, color: AppColors.textLow),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: AppColors.textHigh,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                  Text(
                    description,
                    style: const TextStyle(
                      color: AppColors.textLow,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.play_arrow_rounded,
                size: 16, color: AppColors.textLow),
          ],
        ),
      ),
    );
  }
}
