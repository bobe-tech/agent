-- 012_tick_log_strategy_fields — align tick_log with the ATR+CRSI strategy: add the indicators the
-- new strategy decides on; drop the dead columns of the retired strategy (no consumer remains).
ALTER TABLE tick_log
  ADD COLUMN live_close    NUMERIC,
  ADD COLUMN high_24h      NUMERIC,
  ADD COLUMN daily_vol_pct NUMERIC,
  ADD COLUMN adx_mult      NUMERIC,
  ADD COLUMN crsi_min_3h   NUMERIC,
  DROP COLUMN sma20,
  DROP COLUMN sma50,
  DROP COLUMN hh20,
  DROP COLUMN ll20,
  DROP COLUMN hh50,
  DROP COLUMN ll50;

COMMENT ON COLUMN tick_log.live_close IS 'Current price at the tick = close of the latest candle in the DB (the price the decision was made on).';
COMMENT ON COLUMN tick_log.high_24h IS 'Highest high over the trailing 24h window (the LONG entry anchor).';
COMMENT ON COLUMN tick_log.daily_vol_pct IS 'Daily ATR-14 % (dv) — the averaging volatility base.';
COMMENT ON COLUMN tick_log.adx_mult IS 'ADX multiplier applied to every threshold at the tick.';
COMMENT ON COLUMN tick_log.crsi_min_3h IS 'Minimum CRSI over the crossing window (entry/averaging gate input).';

-- Refresh the comments of still-existing columns that named retired-strategy parameters.
COMMENT ON COLUMN tick_log.atr_pct IS 'Hourly ATR-14 % (hv) at the tick — the entry/exit volatility base.';
COMMENT ON COLUMN tick_log.crsi IS 'Connors RSI at the tick — feeds the next ticks crsi_min over the crossing window.';
COMMENT ON COLUMN tick_log.expected_move_pct IS 'The expected take-profit = hv * adx_mult, %.';
COMMENT ON COLUMN positions.expected_move_pct IS 'The computed take-profit at entry (hv * adx_mult), %.';
COMMENT ON COLUMN params.config IS 'The strategy JSONB config: strategy, side_mode, sizes_usd, max_adds, adx_mult_threshold/adx_mult_lo/adx_mult_hi, avg2_atr_mult, crsi_buy (per-pair), crsi_window_hours, high_window_hours, crsi_rsi_period/crsi_streak_period/crsi_rank_period, hackathon_end.';
