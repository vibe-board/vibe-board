import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
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

class ImageViewerScreen extends ConsumerStatefulWidget {
  const ImageViewerScreen({
    super.key,
    required this.projectId,
    required this.taskId,
  });

  final String projectId;
  final String taskId;

  @override
  ConsumerState<ImageViewerScreen> createState() => _ImageViewerScreenState();
}

class _ImageViewerScreenState extends ConsumerState<ImageViewerScreen> {
  bool _uploading = false;

  Future<void> _uploadImage() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    setState(() => _uploading = true);

    try {
      final api = ref.read(imagesApiProvider);
      if (api == null) throw Exception('No server connected');

      List<int> bytes;
      if (file.bytes != null) {
        bytes = file.bytes!;
      } else if (file.path != null) {
        bytes = await File(file.path!).readAsBytes();
      } else {
        throw Exception('Could not read file');
      }

      await api.uploadImage(
        widget.taskId,
        bytes,
        file.name,
        contentType: file.extension != null ? 'image/${file.extension}' : null,
      );
      ref.invalidate(_taskImagesProvider(widget.taskId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final imagesAsync = ref.watch(_taskImagesProvider(widget.taskId));

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
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: _uploading
                ? const Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.brand),
                    ),
                  )
                : IconButton(
                    icon: const Icon(Icons.upload_rounded,
                        size: AppSpacing.iconSizeLg),
                    color: AppColors.textNormal,
                    splashRadius: 16,
                    tooltip: 'Upload image',
                    onPressed: _uploadImage,
                  ),
          ),
        ],
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
                  const SizedBox(height: AppSpacing.md),
                  TextButton.icon(
                    onPressed: _uploadImage,
                    icon: const Icon(Icons.upload_rounded, size: 18),
                    label: const Text('Upload Image'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.brand,
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
