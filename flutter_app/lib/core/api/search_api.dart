import '../models/enums.dart';
import 'api_client.dart';

class SearchResult {
  SearchResult({
    required this.path,
    required this.isFile,
    required this.matchType,
    required this.score,
  });

  final String path;
  final bool isFile;
  final SearchMatchType matchType;
  final int score;

  factory SearchResult.fromJson(Map<String, dynamic> json) => SearchResult(
        path: json['path'] as String,
        isFile: json['is_file'] as bool,
        matchType: SearchMatchType.fromString(json['match_type'] as String),
        score: (json['score'] as num).toInt(),
      );
}

class SearchApi {
  SearchApi(this._client);
  final ApiClient _client;

  Future<List<SearchResult>> search({
    required String query,
    List<String>? repoIds,
    String mode = 'taskform',
  }) async {
    final params = <String, String>{'q': query, 'mode': mode};
    if (repoIds != null && repoIds.isNotEmpty) {
      params['repo_ids'] = repoIds.join(',');
    }
    final list = await _client.getList('/api/search', query: params);
    return list
        .map((j) => SearchResult.fromJson(j as Map<String, dynamic>))
        .toList();
  }
}
