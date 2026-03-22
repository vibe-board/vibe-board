import 'dart:convert';
import 'package:http/http.dart' as http;

/// Base API client that handles HTTP requests to the vibe-board server.
///
/// Supports direct HTTP connection mode. E2EE tunnel mode is handled
/// separately via [E2EEConnection] which wraps requests as encrypted
/// WebSocket messages.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? httpClient})
      : _client = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Map<String, String> get _defaultHeaders => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  Uri _uri(String path, [Map<String, String>? query]) {
    final uri = Uri.parse('$baseUrl$path');
    if (query != null && query.isNotEmpty) {
      return uri.replace(queryParameters: query);
    }
    return uri;
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, String>? query,
  }) async {
    final resp = await _client.get(
      _uri(path, query),
      headers: _defaultHeaders,
    );
    return _handleResponse(resp);
  }

  /// GET that returns a raw string (e.g. profiles content).
  Future<String> getString(
    String path, {
    Map<String, String>? query,
  }) async {
    final resp = await _client.get(
      _uri(path, query),
      headers: _defaultHeaders,
    );
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return resp.body;
    }
    throw ApiException(resp.statusCode, resp.body);
  }

  /// GET returning a list of JSON objects.
  Future<List<dynamic>> getList(
    String path, {
    Map<String, String>? query,
  }) async {
    final resp = await _client.get(
      _uri(path, query),
      headers: _defaultHeaders,
    );
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as List<dynamic>;
    }
    throw ApiException(resp.statusCode, resp.body);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    Map<String, String>? query,
  }) async {
    final resp = await _client.post(
      _uri(path, query),
      headers: _defaultHeaders,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleResponse(resp);
  }

  Future<Map<String, dynamic>> put(
    String path, {
    Object? body,
    Map<String, String>? query,
  }) async {
    final resp = await _client.put(
      _uri(path, query),
      headers: _defaultHeaders,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleResponse(resp);
  }

  Future<void> delete(
    String path, {
    Map<String, String>? query,
  }) async {
    final resp = await _client.delete(
      _uri(path, query),
      headers: _defaultHeaders,
    );
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw ApiException(resp.statusCode, resp.body);
    }
  }

  Future<Map<String, dynamic>> _handleResponse(http.Response resp) async {
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      if (resp.body.isEmpty) return {};
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    throw ApiException(resp.statusCode, resp.body);
  }

  void dispose() => _client.close();
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode): $body';
}
