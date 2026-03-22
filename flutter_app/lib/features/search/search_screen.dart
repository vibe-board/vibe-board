import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/search_api.dart';
import '../../core/models/enums.dart';
import '../../ui/theme/color_tokens.dart';
import '../../ui/theme/spacing.dart';

final _searchResultsProvider =
    FutureProvider.family<List<SearchResult>, String>((ref, query) {
  final api = ref.watch(searchApiProvider);
  if (api == null || query.isEmpty) return [];
  return api.search(query: query);
});

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      setState(() => _query = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final resultsAsync =
        _query.isNotEmpty ? ref.watch(_searchResultsProvider(_query)) : null;

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
        title: TextField(
          controller: _controller,
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
          onChanged: _onSearchChanged,
        ),
      ),
      body: resultsAsync == null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search_rounded, size: 48, color: AppColors.textLow),
                  const SizedBox(height: AppSpacing.lg),
                  const Text(
                    'Search across all repos',
                    style: TextStyle(
                      color: AppColors.textNormal,
                      fontSize: 15,
                      fontFamily: 'IBM Plex Sans',
                    ),
                  ),
                ],
              ),
            )
          : resultsAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
              error: (error, _) => Center(
                child: Text(
                  'Search failed: $error',
                  style: const TextStyle(color: AppColors.error, fontSize: 13),
                ),
              ),
              data: (results) {
                if (results.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.search_off_rounded, size: 48, color: AppColors.textLow),
                        const SizedBox(height: AppSpacing.lg),
                        const Text(
                          'No results found',
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
                  itemCount: results.length,
                  itemBuilder: (context, index) {
                    final result = results[index];
                    return _SearchResultTile(result: result);
                  },
                );
              },
            ),
    );
  }
}

class _SearchResultTile extends StatelessWidget {
  const _SearchResultTile({required this.result});
  final SearchResult result;

  @override
  Widget build(BuildContext context) {
    final icon = result.isFile ? Icons.description_rounded : Icons.folder_rounded;
    final matchLabel = switch (result.matchType) {
      SearchMatchType.fileName => 'file name',
      SearchMatchType.directoryName => 'directory',
      SearchMatchType.fullPath => 'full path',
    };

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.xs),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgSurface,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textLow),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.path,
                  style: const TextStyle(
                    color: AppColors.textHigh,
                    fontSize: 13,
                    fontFamily: 'IBM Plex Mono',
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  matchLabel,
                  style: const TextStyle(
                    color: AppColors.textLow,
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
