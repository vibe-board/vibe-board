import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/image_ref.dart';
import 'api_client.dart';

class ImagesApi {
  ImagesApi(this._client);
  final ApiClient _client;

  Future<List<ImageMetadata>> getTaskImages(String taskId) async {
    final list = await _client.getList('/api/images/task/$taskId/metadata');
    return list.map((j) => ImageMetadata.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> deleteImage(String imageId) async {
    await _client.delete('/api/images/$imageId');
  }

  Future<ImageMetadata> uploadImage(String taskId, List<int> bytes, String filename, {String? contentType}) async {
    final uri = Uri.parse('${_client.baseUrl}/api/images/upload');
    final request = http.MultipartRequest('POST', uri);
    request.fields['task_id'] = taskId;
    request.files.add(http.MultipartFile.fromBytes(
      'file',
      bytes,
      filename: filename,
    ));
    if (contentType != null) {
      request.fields['content_type'] = contentType;
    }
    final streamed = await request.send();
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return ImageMetadata.fromJson(jsonDecode(resp.body) as Map<String, dynamic>);
    }
    throw ApiException(resp.statusCode, resp.body);
  }
}
