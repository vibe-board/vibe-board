import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/models/image_ref.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';
import '../../ui/components/app_badge.dart';

final _taskImagesProvider = FutureProvider.family<List<ImageMetadata>, String>((ref, taskId) {
  final api = ref.watch(imagesApiProvider);
  if (api == null) return [];
  return api.getTaskImages(taskId);
});

class ImageViewerScreen extends ConsumerWidget {
  const ImageViewerScreen({
    super.key,
    required this.projectId,
    required this.taskId,
  });

  final String projectId;
  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final imagesAsync = ref.watch(_taskImagesProvider(taskId));

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
          'Images',
          style: TextStyle(
            color: AppColors.textHigh,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFamily: 'IBM Plex Sans',
          ),
        ),
      ),
      body: imagesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (error, _) => Center(
          child: Text(
            'Failed to load images: $error',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
        ),
        data: (images) {
          if (images.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.image_outlined, size: 48, color: AppColors.textLow),
                  const SizedBox(height: AppSpacing.lg),
                  const Text(
                    'No images yet',
                    style: TextStyle(
                      color: AppColors.textNormal,
                      fontSize: 15,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: images.length,
            itemBuilder: (context, index) {
              return _ImageTile(image: images[index]);
            },
          );
        },
      ),
    );
  }
}

class _ImageTile extends StatelessWidget {
  const _ImageTile({required this.image});
  final ImageMetadata image;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.bgPanel,
              borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
            ),
            child: const Icon(Icons.image_rounded, color: AppColors.textLow, size: 24),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  image.filename,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
                Text(
                  _formatFileSize(image.fileSize),
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
            label: image.contentType ?? 'unknown',
            color: AppColors.textLow,
          ),
        ],
      ),
    );
  }

  String _formatFileSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
