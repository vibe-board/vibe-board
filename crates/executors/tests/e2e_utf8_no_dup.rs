// End-to-end regression test for the duplicate-assistant-message bug.
//
// When a child process's stdout is read with a fixed-size buffer (ReaderStream's
// 4096-byte default), a multi-byte UTF-8 char can straddle a read boundary.
// Decoding each chunk independently with String::from_utf8_lossy corrupted that
// char into U+FFFD. The corrupted streamed/assistant text then no longer matched
// the clean `result` text, defeating the `result`-vs-`last_assistant_message`
// dedup in the Claude normalizer and rendering the final message TWICE (one
// corrupted copy + one clean copy).
//
// These tests drive the full pipeline — raw bytes split mid-character → decode →
// MsgStore → real Claude normalizer — and assert that with the incremental
// `decode_utf8_chunks` adapter the text stays intact and renders as ONE bubble.
// A companion test pins the old per-chunk-lossy behavior so the reproduction
// can't silently stop exercising the bug.

use std::sync::Arc;

use executors::executors::{StandardCodingAgentExecutor, claude::ClaudeCode};
use executors::logs::{NormalizedEntry, NormalizedEntryType, utils::ConversationSink};
use futures::StreamExt;
use tokio_util::bytes::Bytes;
use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore, stream_lines::decode_utf8_chunks};

fn final_text() -> String {
    // Contains the multi-byte char '储' (E5 82 A8) near the end; the chunk
    // boundary will be forced to split it.
    "目标达成。完整技术选型与验证完成,by-reference 结果存储 + call-index journal + Bus 进度 + dry-run 预览。".to_string()
}

fn build_stream_json() -> Vec<u8> {
    let text = final_text();
    let esc = serde_json::to_string(&text).unwrap(); // includes surrounding quotes
    let inner = &esc[1..esc.len() - 1]; // escaped, without quotes
    let mut s = String::new();
    s.push_str(r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"m1","role":"assistant","content":[]}}}"#);
    s.push('\n');
    s.push_str(r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#);
    s.push('\n');
    // one delta carrying the full text
    s.push_str(&format!(
        r#"{{"type":"stream_event","event":{{"type":"content_block_delta","index":0,"delta":{{"type":"text_delta","text":"{inner}"}}}}}}"#
    ));
    s.push('\n');
    // top-level assistant with the same text (arrives before message_stop)
    s.push_str(&format!(
        r#"{{"type":"assistant","message":{{"id":"m1","role":"assistant","content":[{{"type":"text","text":"{inner}"}}]}}}}"#
    ));
    s.push('\n');
    s.push_str(r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0}}"#);
    s.push('\n');
    s.push_str(r#"{"type":"stream_event","event":{"type":"message_stop"}}"#);
    s.push('\n');
    // result with the same text
    s.push_str(&format!(
        r#"{{"type":"result","subtype":"success","is_error":false,"duration_ms":1000,"result":"{inner}"}}"#
    ));
    s.push('\n');
    s.into_bytes()
}

async fn count_heading_bubbles(use_fixed_decoder: bool) -> Vec<String> {
    let bytes = build_stream_json();

    // Build chunk boundaries that split the '储' (E5 82 A8) in the streamed delta
    // and the top-level assistant record — but NOT the one in the final result
    // record (in real logs the result text is emitted intact within one chunk).
    // This mirrors test2.json: streamed/assistant copies corrupted, result clean.
    let chu = "储".as_bytes(); // E5 82 A8
    let result_marker = br#""result":""#;
    let result_start = bytes
        .windows(result_marker.len())
        .position(|w| w == result_marker)
        .expect("result record present");
    let mut cut_points: Vec<usize> = Vec::new();
    let mut i = 0;
    while let Some(rel) = bytes[i..].windows(chu.len()).position(|w| w == chu) {
        let abs = i + rel;
        if abs < result_start {
            cut_points.push(abs + 2); // inside the final byte of '储'
        }
        i = abs + chu.len();
    }
    assert!(
        cut_points.len() >= 2,
        "expected '储' in both delta and assistant records before the result"
    );

    // Slice the byte stream at those cut points into chunks.
    let mut chunks: Vec<std::io::Result<Bytes>> = Vec::new();
    let mut prev = 0;
    for &cp in &cut_points {
        chunks.push(Ok(Bytes::copy_from_slice(&bytes[prev..cp])));
        prev = cp;
    }
    chunks.push(Ok(Bytes::copy_from_slice(&bytes[prev..])));

    // Decode either via the production adapter (fixed) or per-chunk lossy (old bug).
    let msg_store = Arc::new(MsgStore::new());
    let decoded: Vec<String> = if use_fixed_decoder {
        decode_utf8_chunks(futures::stream::iter(chunks))
            .map(|r: std::io::Result<String>| r.unwrap())
            .collect::<Vec<_>>()
            .await
    } else {
        chunks
            .into_iter()
            .map(|r| String::from_utf8_lossy(&r.unwrap()).into_owned())
            .collect()
    };
    for s in decoded {
        msg_store.push_stdout(s);
    }
    msg_store.push_finished();

    // Run the real normalizer.
    let executor = serde_json::from_str::<ClaudeCode>("{}").unwrap();
    let sink: Arc<dyn ConversationSink> = Arc::new(msg_store.clone());
    executor.normalize_logs(sink, std::path::Path::new("/tmp/test-worktree"));
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Reconstruct final entries from patches.
    use std::collections::BTreeMap;
    let mut map: BTreeMap<usize, NormalizedEntry> = BTreeMap::new();
    for msg in msg_store.get_history() {
        if let LogMsg::JsonPatch(patch) = msg {
            let v = serde_json::to_value(&patch).unwrap();
            for op in v.as_array().unwrap() {
                let path = op.get("path").and_then(|p| p.as_str()).unwrap_or("");
                let opn = op.get("op").and_then(|p| p.as_str()).unwrap_or("");
                if let Some(idx) = path.strip_prefix("/entries/").and_then(|n| n.parse::<usize>().ok()) {
                    match opn {
                        "add" | "replace" => {
                            if let Some(val) = op.get("value").and_then(|v| v.get("content"))
                                && let Ok(e) = serde_json::from_value::<NormalizedEntry>(val.clone())
                            {
                                map.insert(idx, e);
                            }
                        }
                        "remove" => {
                            map.remove(&idx);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    map.values()
        .filter(|e| {
            matches!(e.entry_type, NormalizedEntryType::AssistantMessage)
                && e.content.contains("by-reference 结果存")
        })
        .map(|e| e.content.clone())
        .collect()
}

#[tokio::test]
async fn end_to_end_no_duplicate_when_char_split_across_chunks() {
    // With the fix: text is intact and dedup collapses streamed/assistant/result
    // into ONE bubble.
    let bubbles = count_heading_bubbles(true).await;
    for b in &bubbles {
        eprintln!("FIXED bubble: {b:?}");
        assert!(!b.contains('\u{FFFD}'), "text must not be corrupted");
    }
    assert_eq!(bubbles.len(), 1, "expected ONE bubble with fix, got {}", bubbles.len());
}

#[tokio::test]
async fn end_to_end_old_lossy_behavior_duplicates() {
    // Guard: prove the OLD per-chunk lossy decode reproduces the bug (2 bubbles,
    // one corrupted). If this ever yields 1, the test no longer exercises the bug.
    let bubbles = count_heading_bubbles(false).await;
    for b in &bubbles {
        eprintln!("OLD bubble: {b:?}");
    }
    assert_eq!(bubbles.len(), 2, "old lossy decode should duplicate, got {}", bubbles.len());
    assert!(
        bubbles.iter().any(|b| b.contains('\u{FFFD}')),
        "one of the duplicated bubbles should be corrupted"
    );
}
