import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _profilesProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.watch(configApiProvider);
  if (api == null) throw Exception('No server connected');
  return api.getProfiles();
});

class ExecutorProfilesScreen extends ConsumerWidget {
  const ExecutorProfilesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profilesAsync = ref.watch(_profilesProvider);

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
          'Executor Profiles',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: profilesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => Center(
          child: Text(
            'Failed to load profiles: $error',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
        ),
        data: (profiles) {
          final entries = profiles.entries.toList();
          if (entries.isEmpty) {
            return const Center(
              child: Text(
                'No executor profiles configured.',
                style: TextStyle(color: AppColors.textLow, fontSize: 13),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return _ProfileTile(
                name: entry.key,
                profile: entry.value,
              );
            },
          );
        },
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({required this.name, required this.profile});
  final String name;
  final dynamic profile;

  @override
  Widget build(BuildContext context) {
    final profileMap = profile is Map<String, dynamic> ? profile as Map<String, dynamic> : <String, dynamic>{};
    final executor = profileMap['executor'] as String? ?? '';
    final variant = profileMap['variant'] as String?;

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
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.brandMuted,
              borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
            ),
            child: const Icon(Icons.smart_toy_rounded, color: AppColors.brand, size: 18),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  [executor, if (variant != null) variant].join(' / '),
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.textLow, size: 18),
        ],
      ),
    );
  }
}
