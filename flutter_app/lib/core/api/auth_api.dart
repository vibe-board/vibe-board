import 'api_client.dart';

class AuthApi {
  AuthApi(this._client);
  final ApiClient _client;

  Future<Map<String, dynamic>> status() async {
    return _client.get('/api/auth/status');
  }

  Future<void> logout() async {
    await _client.post('/api/auth/logout');
  }

  Future<Map<String, dynamic>> handoffInit({
    required String provider,
    required String returnTo,
  }) async {
    return _client.post(
      '/api/auth/handoff/init',
      body: {'provider': provider, 'return_to': returnTo},
    );
  }
}
