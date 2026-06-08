//! Tool call timing capture.
//!
//! `ConversationSink` is a typed boundary that executor `normalize_logs`
//! flows publish through. `ConversationMsgStore` is the wrapper that
//! intercepts ToolUse-bearing patches and stamps wall-clock timestamps
//! before forwarding to the underlying `MsgStore`.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use chrono::{DateTime, Utc};
use json_patch::Patch;
use tokio::sync::broadcast;
use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};

use crate::logs::{
    NormalizedEntryType, ToolStatus,
    utils::{ConversationPatch, extract_normalized_entry_from_patch},
};

/// Injectable clock so unit tests can drive timestamps deterministically.
pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// Typed sink that executor normalizers publish through.
///
/// Implemented for both `Arc<MsgStore>` (no-op pass-through) and
/// `Arc<ConversationMsgStore>` (stamps ToolUse timing). Helpers in the
/// executor crate take `Arc<dyn ConversationSink>` so callers can pick
/// either at construction time.
pub trait ConversationSink: Send + Sync {
    fn push_patch(&self, patch: Patch);
    fn push_stdout(&self, s: String);
    fn push_stderr(&self, s: String);
    fn push_session_id(&self, session_id: String);
    fn push_message_id(&self, id: String);
    fn push_finished(&self);
    fn get_history(&self) -> Vec<LogMsg>;
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg>;
    /// Escape hatch for callers that need the underlying `MsgStore`
    /// (e.g. for `sse_stream`, `history_plus_stream`, `spawn_forwarder`).
    fn raw(&self) -> &Arc<MsgStore>;
}

/// Blanket impl for paths that don't need timing capture (e.g. test
/// fixtures, replay-from-DB paths).
impl ConversationSink for Arc<MsgStore> {
    fn push_patch(&self, patch: Patch) {
        MsgStore::push_patch(self, patch);
    }
    fn push_stdout(&self, s: String) {
        MsgStore::push_stdout(self, s);
    }
    fn push_stderr(&self, s: String) {
        MsgStore::push_stderr(self, s);
    }
    fn push_session_id(&self, session_id: String) {
        MsgStore::push_session_id(self, session_id);
    }
    fn push_message_id(&self, id: String) {
        MsgStore::push_message_id(self, id);
    }
    fn push_finished(&self) {
        MsgStore::push_finished(self);
    }
    fn get_history(&self) -> Vec<LogMsg> {
        MsgStore::get_history(self)
    }
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg> {
        MsgStore::get_receiver(self)
    }
    fn raw(&self) -> &Arc<MsgStore> {
        self
    }
}

#[derive(Debug)]
struct ToolTimingState {
    started_at: DateTime<Utc>,
    approved_at: Option<DateTime<Utc>>,
    completed_at: Option<DateTime<Utc>>,
    last_status: ToolStatus,
}

/// Wraps an `Arc<MsgStore>` and stamps `started_at` / `approved_at` /
/// `completed_at` on `NormalizedEntryType::ToolUse` patches before
/// forwarding to the underlying store.
pub struct ConversationMsgStore {
    inner: Arc<MsgStore>,
    state: Mutex<HashMap<usize, ToolTimingState>>,
    clock: Arc<dyn Clock>,
}

impl ConversationMsgStore {
    /// Wrap with the default `SystemClock`. Production callers use this.
    pub fn wrap(inner: Arc<MsgStore>) -> Arc<Self> {
        Self::wrap_with_clock(inner, Arc::new(SystemClock))
    }

    /// Wrap with a caller-supplied clock. Tests use a mock clock here.
    pub fn wrap_with_clock(inner: Arc<MsgStore>, clock: Arc<dyn Clock>) -> Arc<Self> {
        Arc::new(Self {
            inner,
            state: Mutex::new(HashMap::new()),
            clock,
        })
    }
}

impl ConversationMsgStore {
    fn stamp_if_tool_use(&self, patch: Patch) -> Patch {
        let kind = op_kind(&patch);
        if let Some(OpKind::Remove) = kind {
            if let Some(idx) = remove_index(&patch) {
                self.state.lock().unwrap().remove(&idx);
            }
            return patch;
        }
        let Some((idx, mut entry)) = extract_normalized_entry_from_patch(&patch) else {
            return patch;
        };

        let NormalizedEntryType::ToolUse {
            ref mut started_at,
            ref mut approved_at,
            ref mut completed_at,
            ref status,
            ..
        } = entry.entry_type
        else {
            return patch;
        };

        let now = self.clock.now();
        let mut state_map = self.state.lock().unwrap();

        // Treat ADD-on-existing as a fresh insert (with a warn). The wrapper
        // should never see ADD on a tracked index in normal operation; if it
        // does, drop the prior state so the Vacant branch re-stamps.
        if matches!(kind, Some(OpKind::Add)) && state_map.contains_key(&idx) {
            tracing::warn!(
                idx,
                "ConversationMsgStore saw ADD on already-tracked index; resetting state"
            );
            state_map.remove(&idx);
        }

        match state_map.entry(idx) {
            std::collections::hash_map::Entry::Vacant(slot) => {
                *started_at = Some(now);
                if is_terminal(status) {
                    *completed_at = Some(now);
                }
                slot.insert(ToolTimingState {
                    started_at: now,
                    approved_at: None,
                    completed_at: *completed_at,
                    last_status: status.clone(),
                });
            }
            std::collections::hash_map::Entry::Occupied(mut slot) => {
                let prev = slot.get_mut();
                *started_at = Some(prev.started_at);
                *approved_at = prev.approved_at;
                if is_pending_approval(&prev.last_status) && !is_pending_approval(status) {
                    *approved_at = Some(now);
                    prev.approved_at = Some(now);
                }
                if is_terminal(status) {
                    let stamp = prev.completed_at.unwrap_or(now);
                    *completed_at = Some(stamp);
                    prev.completed_at = Some(stamp);
                }
                prev.last_status = status.clone();
            }
        }

        // Reconstruct using the cached op kind from the top of the function;
        // ConversationPatch emits only single-op patches for entries.
        match kind {
            Some(OpKind::Add) => ConversationPatch::add_normalized_entry(idx, entry),
            Some(OpKind::Replace) => ConversationPatch::replace(idx, entry),
            _ => patch,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OpKind {
    Add,
    Replace,
    Remove,
}

fn op_kind(patch: &Patch) -> Option<OpKind> {
    let value = serde_json::to_value(patch).ok()?;
    let ops = value.as_array()?;
    let first = ops.first()?;
    let op = first.get("op")?.as_str()?;
    match op {
        "add" => Some(OpKind::Add),
        "replace" => Some(OpKind::Replace),
        "remove" => Some(OpKind::Remove),
        _ => None,
    }
}

fn remove_index(patch: &Patch) -> Option<usize> {
    let value = serde_json::to_value(patch).ok()?;
    let ops = value.as_array()?;
    let first = ops.first()?;
    let path = first.get("path")?.as_str()?;
    path.strip_prefix("/entries/")?.parse::<usize>().ok()
}

fn is_terminal(status: &ToolStatus) -> bool {
    matches!(
        status,
        ToolStatus::Success | ToolStatus::Failed | ToolStatus::Denied { .. } | ToolStatus::TimedOut
    )
}

fn is_pending_approval(status: &ToolStatus) -> bool {
    matches!(status, ToolStatus::PendingApproval { .. })
}

impl ConversationSink for ConversationMsgStore {
    fn push_patch(&self, patch: Patch) {
        let stamped = self.stamp_if_tool_use(patch);
        self.inner.push_patch(stamped);
    }
    fn push_stdout(&self, s: String) {
        self.inner.push_stdout(s);
    }
    fn push_stderr(&self, s: String) {
        self.inner.push_stderr(s);
    }
    fn push_session_id(&self, session_id: String) {
        self.inner.push_session_id(session_id);
    }
    fn push_message_id(&self, id: String) {
        self.inner.push_message_id(id);
    }
    fn push_finished(&self) {
        self.inner.push_finished();
    }
    fn get_history(&self) -> Vec<LogMsg> {
        self.inner.get_history()
    }
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg> {
        self.inner.get_receiver()
    }
    fn raw(&self) -> &Arc<MsgStore> {
        &self.inner
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex as StdMutex;

    use chrono::TimeZone;

    use super::*;
    use crate::logs::{
        ActionType, NormalizedEntry, NormalizedEntryType, ToolStatus,
        utils::{ConversationPatch, extract_normalized_entry_from_patch},
    };

    /// Test clock returning a controlled sequence of timestamps.
    struct MockClock {
        ticks: StdMutex<Vec<DateTime<Utc>>>,
    }

    impl MockClock {
        fn new(ticks: Vec<DateTime<Utc>>) -> Arc<Self> {
            Arc::new(Self {
                ticks: StdMutex::new(ticks),
            })
        }

        fn at(secs: i64) -> DateTime<Utc> {
            Utc.timestamp_opt(secs, 0).single().unwrap()
        }
    }

    impl Clock for MockClock {
        fn now(&self) -> DateTime<Utc> {
            let mut ticks = self.ticks.lock().unwrap();
            ticks.remove(0)
        }
    }

    fn tool_use_entry(status: ToolStatus) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "Bash".to_string(),
                action_type: ActionType::Other {
                    description: "test".to_string(),
                },
                status,
                started_at: None,
                approved_at: None,
                completed_at: None,
            },
            content: String::new(),
            metadata: None,
            agent_id: None,
        }
    }

    fn last_history_patch(store: &MsgStore) -> Patch {
        store
            .get_history()
            .into_iter()
            .filter_map(|m| match m {
                LogMsg::JsonPatch(p) => Some(p),
                _ => None,
            })
            .next_back()
            .expect("expected at least one patch in history")
    }

    #[test]
    fn add_created_tool_use_stamps_started_at() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        let patch = ConversationPatch::add_normalized_entry(0, tool_use_entry(ToolStatus::Created));
        sink.push_patch(patch);

        let stored = last_history_patch(&inner);
        let (idx, entry) = extract_normalized_entry_from_patch(&stored)
            .expect("patch should contain a NormalizedEntry");
        assert_eq!(idx, 0);

        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn replace_with_success_stamps_completed_at_and_preserves_started_at() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(105)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::Success),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, Some(MockClock::at(105)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn approval_round_trip_stamps_approved_at_on_leaving_pending() {
        let clock = MockClock::new(vec![
            MockClock::at(100),
            MockClock::at(101),
            MockClock::at(150),
            MockClock::at(151),
        ]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::PendingApproval {
                approval_id: "a".into(),
            }),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::Success),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, Some(MockClock::at(150)));
                assert_eq!(completed_at, Some(MockClock::at(151)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    fn assistant_message_entry() -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: "hi".into(),
            metadata: None,
            agent_id: None,
        }
    }

    #[test]
    fn assistant_message_passes_through_unchanged() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        let original = ConversationPatch::add_normalized_entry(0, assistant_message_entry());
        sink.push_patch(original.clone());

        let stored = last_history_patch(&inner);
        assert_eq!(
            serde_json::to_value(&stored).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
    }

    #[test]
    fn stdout_patch_passes_through_unchanged() {
        let clock = MockClock::new(vec![]); // no clock calls expected
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_stdout("hello\n".into());

        let history = inner.get_history();
        assert!(matches!(history.last(), Some(LogMsg::Stdout(s)) if s == "hello\n"));
    }

    #[test]
    fn remove_patch_drops_state_for_index() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(201)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        // ADD then REMOVE then ADD with same index — second ADD should re-stamp.
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::remove(0));
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse { started_at, .. } => {
                assert_eq!(started_at, Some(MockClock::at(201)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn direct_terminal_emit_stamps_started_and_completed_to_same_now() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Success),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                completed_at,
                approved_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(completed_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn pending_approval_without_resolution_leaves_completed_none() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(101)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::PendingApproval {
                approval_id: "x".into(),
            }),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn denied_without_approval_phase_keeps_approved_at_none() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(101)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::Denied { reason: None }),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, Some(MockClock::at(101)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn duplicate_add_resets_state_with_warn() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(200)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        // First ADD: stamps started_at = 100
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        // Second ADD on the same index: should reset, stamping started_at = 200
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse { started_at, .. } => {
                assert_eq!(started_at, Some(MockClock::at(200)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
}
