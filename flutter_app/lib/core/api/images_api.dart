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
}
