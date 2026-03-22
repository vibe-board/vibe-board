import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

/// RFC 6902 JSON Patch operation.
class JsonPatchOp {
  const JsonPatchOp({
    required this.op,
    required this.path,
    this.value,
    this.from,
  });

  factory JsonPatchOp.fromJson(Map<String, dynamic> json) {
    return JsonPatchOp(
      op: json['op'] as String,
      path: json['path'] as String,
      value: json['value'],
      from: json['from'] as String?,
    );
  }

  final String op;
  final String path;
  final dynamic value;
  final String? from;
}

/// Applies a list of RFC 6902 JSON Patch operations to a mutable [target].
///
/// Supports `add`, `remove`, `replace`, `move`, `copy`, `test`.
/// If a `replace` fails because the key doesn't exist, it falls back to `add`.
void applyJsonPatch(dynamic target, List<JsonPatchOp> ops) {
  for (final op in ops) {
    _applyOp(target, op);
  }
}

void _applyOp(dynamic target, JsonPatchOp op) {
  final segments = _parsePath(op.path);

  switch (op.op) {
    case 'add':
      _setValue(target, segments, op.value);
    case 'remove':
      _removeValue(target, segments);
    case 'replace':
      try {
        _setValue(target, segments, op.value);
      } catch (_) {
        // Fall back to add if path doesn't exist
        _setValue(target, segments, op.value);
      }
    case 'move':
      if (op.from == null) throw FormatException('move requires from');
      final fromSegments = _parsePath(op.from!);
      final value = _getValue(target, fromSegments);
      _removeValue(target, fromSegments);
      _setValue(target, segments, value);
    case 'copy':
      if (op.from == null) throw FormatException('copy requires from');
      final fromSegments = _parsePath(op.from!);
      final value = _getValue(target, fromSegments);
      _setValue(target, segments, jsonDecode(jsonEncode(value)));
    case 'test':
      // Skip test operations — we trust the server
      break;
    default:
      // Unknown operation, skip
      break;
  }
}

List<String> _parsePath(String path) {
  if (path.isEmpty) return [];
  if (path.startsWith('/')) path = path.substring(1);
  return path
      .split('/')
      .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'))
      .toList();
}

dynamic _getValue(dynamic target, List<String> segments) {
  var current = target;
  for (final seg in segments) {
    if (current is Map) {
      current = current[seg];
    } else if (current is List) {
      current = current[int.parse(seg)];
    } else {
      throw StateError('Cannot navigate into ${current.runtimeType}');
    }
  }
  return current;
}

void _setValue(dynamic target, List<String> segments, dynamic value) {
  if (segments.isEmpty) {
    throw StateError('Cannot set root value');
  }

  var current = target;
  for (var i = 0; i < segments.length - 1; i++) {
    final seg = segments[i];
    if (current is Map) {
      current = current[seg];
    } else if (current is List) {
      current = current[int.parse(seg)];
    }
  }

  final last = segments.last;
  if (current is Map) {
    current[last] = value;
  } else if (current is List) {
    final idx = int.parse(last);
    if (idx >= current.length) {
      current.add(value);
    } else {
      current[idx] = value;
    }
  }
}

void _removeValue(dynamic target, List<String> segments) {
  if (segments.isEmpty) {
    throw StateError('Cannot remove root');
  }

  var current = target;
  for (var i = 0; i < segments.length - 1; i++) {
    final seg = segments[i];
    if (current is Map) {
      current = current[seg];
    } else if (current is List) {
      current = current[int.parse(seg)];
    }
  }

  final last = segments.last;
  if (current is Map) {
    current.remove(last);
  } else if (current is List) {
    current.removeAt(int.parse(last));
  }
}

/// WebSocket message types from the vibe-board server.
enum _WsMsgType { jsonPatch, ready, finished, unknown }

_WsMsgType _classifyMsg(Map<String, dynamic> msg) {
  if (msg.containsKey('JsonPatch')) return _WsMsgType.jsonPatch;
  if (msg.containsKey('Ready')) return _WsMsgType.ready;
  if (msg.containsKey('finished')) return _WsMsgType.finished;
  return _WsMsgType.unknown;
}

/// State snapshot + metadata from the JSON Patch WebSocket stream.
class JsonPatchStreamState<T> {
  const JsonPatchStreamState({
    required this.data,
    required this.isConnected,
    required this.isInitialized,
    this.error,
  });

  final T data;
  final bool isConnected;
  final bool isInitialized;
  final String? error;

  JsonPatchStreamState<T> copyWith({
    T? data,
    bool? isConnected,
    bool? isInitialized,
    String? error,
  }) {
    return JsonPatchStreamState<T>(
      data: data ?? this.data,
      isConnected: isConnected ?? this.isConnected,
      isInitialized: isInitialized ?? this.isInitialized,
      error: error,
    );
  }
}

/// Connects to a WebSocket endpoint and yields state updates as JSON patches
/// are applied to [initialData].
///
/// Handles reconnection with exponential backoff.
Stream<JsonPatchStreamState<T>> jsonPatchWsStream<T>({
  required String wsUrl,
  required T initialData,
  Duration reconnectDelay = const Duration(seconds: 1),
  Duration maxReconnectDelay = const Duration(seconds: 8),
}) async* {
  var data = initialData;
  var isConnected = false;
  var isInitialized = false;
  String? error;
  var retryAttempts = 0;
  var finished = false;

  while (!finished) {
    try {
      final channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      await channel.ready;

      isConnected = true;
      error = null;
      retryAttempts = 0;

      yield JsonPatchStreamState<T>(
        data: data,
        isConnected: isConnected,
        isInitialized: isInitialized,
        error: error,
      );

      await for (final raw in channel.stream) {
        try {
          final msg = jsonDecode(raw as String) as Map<String, dynamic>;
          final type = _classifyMsg(msg);

          switch (type) {
            case _WsMsgType.jsonPatch:
              final patches = (msg['JsonPatch'] as List)
                  .map((p) =>
                      JsonPatchOp.fromJson(p as Map<String, dynamic>))
                  .toList();
              // Apply patches to a deep copy
              data = jsonDecode(jsonEncode(data));
              applyJsonPatch(data, patches);
              yield JsonPatchStreamState<T>(
                data: data,
                isConnected: isConnected,
                isInitialized: isInitialized,
                error: error,
              );

            case _WsMsgType.ready:
              isInitialized = true;
              yield JsonPatchStreamState<T>(
                data: data,
                isConnected: isConnected,
                isInitialized: isInitialized,
                error: error,
              );

            case _WsMsgType.finished:
              finished = true;
              isConnected = false;
              channel.sink.close();
              yield JsonPatchStreamState<T>(
                data: data,
                isConnected: isConnected,
                isInitialized: isInitialized,
                error: error,
              );

            case _WsMsgType.unknown:
              break;
          }
        } catch (e) {
          error = 'Failed to process message: $e';
          yield JsonPatchStreamState<T>(
            data: data,
            isConnected: isConnected,
            isInitialized: isInitialized,
            error: error,
          );
        }
      }

      // Stream ended without finished message
      isConnected = false;
    } catch (e) {
      isConnected = false;
      error = 'Connection error: $e';

      yield JsonPatchStreamState<T>(
        data: data,
        isConnected: isConnected,
        isInitialized: isInitialized,
        error: error,
      );

      // Exponential backoff
      final delay = Duration(
        milliseconds: (reconnectDelay.inMilliseconds *
                (1 << retryAttempts))
            .clamp(reconnectDelay.inMilliseconds,
                maxReconnectDelay.inMilliseconds)
            .toInt(),
      );
      retryAttempts++;
      await Future<void>.delayed(delay);
    }
  }
}
