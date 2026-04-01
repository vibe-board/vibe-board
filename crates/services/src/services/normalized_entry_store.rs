use std::sync::RwLock;

use futures::StreamExt;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

use executors::logs::{NormalizedEntry, utils::patch::ConversationPatch};
use utils::log_msg::LogMsg;

#[derive(Debug, Clone)]
pub enum EntryOp {
    Add(usize, NormalizedEntry),
    Replace(usize, NormalizedEntry),
}

pub struct NormalizedEntryStore {
    entries: RwLock<Vec<(usize, NormalizedEntry)>>,
    sender: broadcast::Sender<EntryOp>,
}

impl Default for NormalizedEntryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl NormalizedEntryStore {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(10000);
        Self {
            entries: RwLock::new(Vec::with_capacity(64)),
            sender,
        }
    }

    pub fn push(&self, index: usize, entry: NormalizedEntry) {
        {
            let mut entries = self.entries.write().unwrap();
            entries.push((index, entry.clone()));
        }
        let _ = self.sender.send(EntryOp::Add(index, entry));
    }

    pub fn replace(&self, index: usize, entry: NormalizedEntry) {
        {
            let mut entries = self.entries.write().unwrap();
            if let Some(pos) = entries.iter().position(|(i, _)| *i == index) {
                entries[pos] = (index, entry.clone());
            } else {
                entries.push((index, entry.clone()));
            }
        }
        let _ = self.sender.send(EntryOp::Replace(index, entry));
    }

    pub fn snapshot(&self) -> Vec<(usize, NormalizedEntry)> {
        self.entries.read().unwrap().clone()
    }

    pub fn history_plus_live(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>> {
        let history = self.snapshot();
        let rx = self.sender.subscribe();

        let hist = futures::stream::iter(history.into_iter().map(|(index, entry)| {
            let patch = ConversationPatch::add_normalized_entry(index, entry);
            Ok::<_, std::io::Error>(LogMsg::JsonPatch(patch))
        }));

        let live = BroadcastStream::new(rx).filter_map(|res| async move {
            match res {
                Ok(op) => {
                    let msg = match op {
                        EntryOp::Add(index, entry) => {
                            let patch = ConversationPatch::add_normalized_entry(index, entry);
                            LogMsg::JsonPatch(patch)
                        }
                        EntryOp::Replace(index, entry) => {
                            let patch = ConversationPatch::replace(index, entry);
                            LogMsg::JsonPatch(patch)
                        }
                    };
                    Some(Ok::<_, std::io::Error>(msg))
                }
                Err(_) => None,
            }
        });

        Box::pin(hist.chain(live))
    }
}
