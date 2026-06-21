-- 004_tick_log — a log of every tick (once every 20 min), even HOLD; +usage for cost tracking.
CREATE TABLE tick_log (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    pair               varchar(10) NOT NULL,
    ts                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    regime             varchar(12) NOT NULL,
    action             varchar(12) NOT NULL,
    close NUMERIC, atr_pct NUMERIC, sma20 NUMERIC, sma50 NUMERIC, adx NUMERIC,
    hh20 NUMERIC, ll20 NUMERIC, hh50 NUMERIC, ll50 NUMERIC, fng NUMERIC, btc_dom NUMERIC,
    crsi NUMERIC,
    expected_move_pct  numeric(12,6),
    confidence         NUMERIC,
    reason             TEXT,
    applied_lessons    JSONB,
    position_id        BIGINT REFERENCES positions(id),
    params_version     INTEGER NOT NULL REFERENCES params(version),
    live_bid           NUMERIC,
    live_ask           NUMERIC,
    raw_decision       JSONB NOT NULL,
    cost_usd           NUMERIC(12,6),
    input_tokens       INTEGER,
    output_tokens      INTEGER,
    cache_read_tokens  INTEGER,
    num_turns          INTEGER,
    duration_ms        INTEGER
);
CREATE INDEX tick_log_pair_ts ON tick_log (pair, ts);
CREATE INDEX tick_log_regime  ON tick_log (pair, regime, action);

COMMENT ON TABLE tick_log IS 'A log of every tick (once every 20 min), even HOLD; a mirror of the features + the tick usage.';
COMMENT ON COLUMN tick_log.id IS 'The tick record identifier.';
COMMENT ON COLUMN tick_log.pair IS 'The trading pair.';
COMMENT ON COLUMN tick_log.ts IS 'The tick time.';
COMMENT ON COLUMN tick_log.regime IS 'The market regime at the tick (UP_TREND/DOWN_TREND/RANGE/LOWVOL).';
COMMENT ON COLUMN tick_log.action IS 'The tick action (OPEN_LONG/OPEN_SHORT/ADD/CLOSE/HOLD).';
COMMENT ON COLUMN tick_log.close IS 'The close price of the last candle at the tick.';
COMMENT ON COLUMN tick_log.atr_pct IS 'ATR as % of the price at the tick.';
COMMENT ON COLUMN tick_log.sma20 IS 'The 20-period moving average.';
COMMENT ON COLUMN tick_log.sma50 IS 'The 50-period moving average.';
COMMENT ON COLUMN tick_log.adx IS 'ADX — the average directional movement index.';
COMMENT ON COLUMN tick_log.hh20 IS 'Highest High over 20 periods.';
COMMENT ON COLUMN tick_log.ll20 IS 'Lowest Low over 20 periods.';
COMMENT ON COLUMN tick_log.hh50 IS 'Highest High over 50 periods.';
COMMENT ON COLUMN tick_log.ll50 IS 'Lowest Low over 50 periods.';
COMMENT ON COLUMN tick_log.fng IS 'The Fear & Greed Index at the tick.';
COMMENT ON COLUMN tick_log.btc_dom IS 'BTC dominance at the tick, %.';
COMMENT ON COLUMN tick_log.crsi IS 'Connors RSI at the tick (needed by the next tick as crsi_prev).';
COMMENT ON COLUMN tick_log.expected_move_pct IS 'The expected take-profit = tp_mult * atr_pct, %.';
COMMENT ON COLUMN tick_log.confidence IS 'The LLM confidence in the decision (0–1).';
COMMENT ON COLUMN tick_log.reason IS 'The textual justification of the tick decision from the LLM.';
COMMENT ON COLUMN tick_log.applied_lessons IS 'A JSON array of the lessons applied at the tick.';
COMMENT ON COLUMN tick_log.position_id IS 'The position affected by the tick (open/add/close).';
COMMENT ON COLUMN tick_log.params_version IS 'The active parameter version at the tick.';
COMMENT ON COLUMN tick_log.live_bid IS 'The live bid from the twak quote (for PnL in the summary).';
COMMENT ON COLUMN tick_log.live_ask IS 'The live ask from the twak quote.';
COMMENT ON COLUMN tick_log.raw_decision IS 'The full JSON of the tick decision.';
COMMENT ON COLUMN tick_log.cost_usd IS 'The tick cost, USD (record-usage).';
COMMENT ON COLUMN tick_log.input_tokens IS 'The number of input tokens of the LLM call.';
COMMENT ON COLUMN tick_log.output_tokens IS 'The number of output tokens of the LLM call.';
COMMENT ON COLUMN tick_log.cache_read_tokens IS 'Cached tokens read (cache_read).';
COMMENT ON COLUMN tick_log.num_turns IS 'The number of steps (turns) in the tick agent loop.';
COMMENT ON COLUMN tick_log.duration_ms IS 'The tick execution time, ms.';
