import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

class SearchScreen extends ConsumerWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search files across repositories...',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
          ),
          style: const TextStyle(
            color: AppColors.textHigh,
            fontSize: 14,
            fontFamily: 'IBM Plex Sans',
          ),
          onSubmitted: (query) {
            // TODO: trigger search
          },
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.search_rounded,
              size: 48,
              color: AppColors.textLow,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Search across all repos',
              style: TextStyle(
                color: AppColors.textNormal,
                fontSize: 15,
                fontFamily: 'IBM Plex Sans',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
