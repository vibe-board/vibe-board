-- Data migration handled in Rust (db::data_migrations::export_execution_process_logs).
-- The Rust migration exports logs to JSONL files, then drops this table.
SELECT 1;
