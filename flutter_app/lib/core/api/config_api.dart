import '../models/config.dart';
import 'api_client.dart';

class ConfigApi {
  ConfigApi(this._client);
  final ApiClient _client;

  Future<Map<String, dynamic>> getSystemInfo() async {
    return _client.get('/api/info');
  }

  Future<Config> saveConfig(Config config) async {
    final json = await _client.put('/api/config', body: config.toJson());
    return Config.fromJson(json);
  }
}
