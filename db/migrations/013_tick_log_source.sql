-- 013_tick_log_source — mark who decided the tick: the LLM agent or the cheap pre-filter gate.
-- The gate (bin/tick-gate.mjs) writes HOLD ticks it resolved itself (no LLM run) with source='prefilter',
-- so they can be told apart from agent decisions in analysis (e.g. WHERE source='prefilter').
ALTER TABLE tick_log
  ADD COLUMN source varchar(16) NOT NULL DEFAULT 'agent';

COMMENT ON COLUMN tick_log.source IS 'Who produced the tick: agent (the LLM ran) or prefilter (the ATR gate resolved it to HOLD without running the LLM).';
