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

  // MCP Config
  Future<Map<String, dynamic>> getMcpServers() async {
    return _client.get('/api/mcp-config');
  }

  Future<void> updateMcpServers(Map<String, dynamic> config) async {
    await _client.post('/api/mcp-config', body: config);
  }

  // Executor Profiles
  Future<Map<String, dynamic>> getProfiles() async {
    return _client.get('/api/profiles');
  }

  Future<void> updateProfiles(Map<String, dynamic> profiles) async {
    await _client.put('/api/profiles', body: profiles);
  }

  // Editor/Agent availability
  Future<Map<String, dynamic>> checkEditorAvailability() async {
    return _client.get('/api/editors/check-availability');
  }

  Future<Map<String, dynamic>> checkAgentAvailability() async {
    return _client.get('/api/agents/check-availability');
  }
}
