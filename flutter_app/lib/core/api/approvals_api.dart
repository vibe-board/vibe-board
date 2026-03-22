import 'api_client.dart';

class ApprovalsApi {
  ApprovalsApi(this._client);
  final ApiClient _client;

  Future<void> respond(String approvalId, {required bool approved, String? answer}) async {
    final body = <String, dynamic>{'approved': approved};
    if (answer != null) body['answer'] = answer;
    await _client.post('/api/approvals/$approvalId/respond', body: body);
  }
}
