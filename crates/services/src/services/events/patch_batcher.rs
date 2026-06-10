use std::{collections::HashMap, sync::Arc, time::Duration};

use json_patch::{Patch, PatchOperation};
use tokio::sync::mpsc;
use utils::{log_msg::LogMsg, msg_store::MsgStore};

/// Accumulate JSON Patches within a short window and broadcast only the
/// merged result.  Patches that touch the same path are deduplicated: only
/// the last write for each path is kept (matching the existing client-side
/// `dedupeOps` logic).  This dramatically reduces gateway traffic during
/// rapid state transitions (e.g. AI execution cycling through task states).
const BATCH_WINDOW_MS: u64 = 10;

#[derive(Clone)]
pub struct PatchBatcher {
    tx: mpsc::UnboundedSender<Patch>,
}

impl PatchBatcher {
    pub fn new(msg_store: Arc<MsgStore>) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<Patch>();

        tokio::spawn(async move {
            loop {
                // Wait for the first patch to arrive.
                let first = match rx.recv().await {
                    Some(p) => p,
                    None => break,
                };

                let mut ops: Vec<PatchOperation> = first.0;
                let deadline = tokio::time::sleep(Duration::from_millis(BATCH_WINDOW_MS));
                tokio::pin!(deadline);

                // Drain all patches that arrive within the batch window.
                loop {
                    tokio::select! {
                        _ = &mut deadline => break,
                        patch = rx.recv() => {
                            match patch {
                                Some(p) => ops.extend(p.0),
                                None => {
                                    // Channel closed — flush what we have and exit.
                                    let merged = dedupe_ops(ops);
                                    if !merged.is_empty() {
                                        msg_store.push(LogMsg::JsonPatch(Patch(merged)));
                                    }
                                    return;
                                }
                            }
                        }
                    }
                }

                let merged = dedupe_ops(ops);
                if !merged.is_empty() {
                    msg_store.push(LogMsg::JsonPatch(Patch(merged)));
                }
            }
        });

        PatchBatcher { tx }
    }

    /// Queue a patch for batched broadcast.
    pub fn push_patch(&self, patch: Patch) {
        let _ = self.tx.send(patch);
    }
}

/// Keep only the last operation for each path, preserving overall order.
fn dedupe_ops(ops: Vec<PatchOperation>) -> Vec<PatchOperation> {
    // Map path → last index in `ops` that touches it.
    let mut last_index: HashMap<String, usize> = HashMap::new();
    for (i, op) in ops.iter().enumerate() {
        last_index.insert(op.path().to_string(), i);
    }
    let mut kept: Vec<(usize, PatchOperation)> = ops
        .into_iter()
        .enumerate()
        .filter(|(i, op)| last_index.get(&op.path().to_string()).copied() == Some(*i))
        .collect();
    kept.sort_by_key(|(i, _)| *i);
    kept.into_iter().map(|(_, op)| op).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use json_patch::ReplaceOperation;
    use serde_json::json;

    fn replace(path: &str, value: serde_json::Value) -> PatchOperation {
        PatchOperation::Replace(ReplaceOperation {
            path: path.to_string().try_into().expect("valid pointer"),
            value,
        })
    }

    #[test]
    fn merges_multi_path_ops_into_one_patch() {
        // Reflects the production scenario: when a task transitions to InReview,
        // execution_process / task / workspace patches all arrive within 10ms
        // and get merged into a single Patch with mixed paths. Downstream
        // stream filters MUST iterate every op or the task update is lost.
        let ops = vec![
            replace("/execution_processes/aaa", json!({"id": "aaa"})),
            replace("/tasks/bbb", json!({"id": "bbb", "status": "inreview"})),
            replace("/workspaces/ccc", json!({"id": "ccc"})),
        ];
        let merged = dedupe_ops(ops);
        assert_eq!(merged.len(), 3);
        assert_eq!(merged[0].path().as_str(), "/execution_processes/aaa");
        assert_eq!(merged[1].path().as_str(), "/tasks/bbb");
        assert_eq!(merged[2].path().as_str(), "/workspaces/ccc");
    }

    #[test]
    fn dedupe_keeps_last_write_per_path() {
        let ops = vec![
            replace("/tasks/abc", json!({"status": "inprogress"})),
            replace("/workspaces/xyz", json!({"id": "xyz"})),
            replace("/tasks/abc", json!({"status": "inreview"})),
        ];
        let merged = dedupe_ops(ops);
        assert_eq!(merged.len(), 2);
        // /workspaces/xyz first (kept at original idx 1)
        assert_eq!(merged[0].path().as_str(), "/workspaces/xyz");
        // /tasks/abc kept at idx 2 with the InReview value
        assert_eq!(merged[1].path().as_str(), "/tasks/abc");
        if let PatchOperation::Replace(r) = &merged[1] {
            assert_eq!(r.value["status"], "inreview");
        } else {
            panic!("expected replace op");
        }
    }
}
