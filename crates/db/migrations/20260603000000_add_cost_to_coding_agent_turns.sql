-- Per-turn cost tracking for coding agent turns.
-- Populated at turn completion for executors that provide cost_usd (currently Claude Code only).
-- model_breakdown stores per-model detail as JSON: {"model_name": {"cost_usd": N, "input_tokens": N, "output_tokens": N}}
ALTER TABLE coding_agent_turns ADD COLUMN cost_usd REAL;
ALTER TABLE coding_agent_turns ADD COLUMN input_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN output_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN model_name TEXT;
ALTER TABLE coding_agent_turns ADD COLUMN model_breakdown TEXT;
