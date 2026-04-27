-- Denormalize `session_id` and `process_created_at` into `normalized_entries`
-- so the session-flat conversation endpoint can filter+order without JOINing
-- `execution_processes`. Values are copied from `execution_processes` and
-- never mutated (a process's session/created_at is immutable once written).
--
-- `dropped` is no longer consulted here: `drop_at_and_after` will DELETE the
-- corresponding normalized_entries rows directly. The `execution_processes`
-- record itself stays as the audit/soft-drop record; raw logs remain in their
-- own table.

CREATE TABLE normalized_entries_new (
    execution_id        BLOB NOT NULL,
    entry_index         INTEGER NOT NULL,
    entry_json          TEXT NOT NULL,
    inserted_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    session_id          BLOB NOT NULL,
    process_created_at  TEXT NOT NULL,
    PRIMARY KEY (execution_id, entry_index)
);

INSERT INTO normalized_entries_new
    (execution_id, entry_index, entry_json, inserted_at, session_id, process_created_at)
SELECT ne.execution_id, ne.entry_index, ne.entry_json, ne.inserted_at,
       ep.session_id, ep.created_at
FROM normalized_entries ne
JOIN execution_processes ep ON ne.execution_id = ep.id
WHERE ep.dropped = FALSE;

DROP TABLE normalized_entries;
ALTER TABLE normalized_entries_new RENAME TO normalized_entries;

CREATE INDEX idx_normalized_entries_session
    ON normalized_entries(session_id, process_created_at, entry_index);
