-- 006_regime_stats — a rolling aggregation by (pair, regime) (written by the reflection-job).
CREATE TABLE regime_stats (
    pair        varchar(10) NOT NULL,
    regime      varchar(12) NOT NULL,
    n_trades    INTEGER NOT NULL DEFAULT 0,
    win_rate    NUMERIC,
    avg_r       NUMERIC,
    avg_pnl_pct NUMERIC,
    median_hold NUMERIC,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pair, regime)
);
COMMENT ON TABLE regime_stats IS 'Aggregated statistics by (pair, regime): winrate/avg_r/PnL — written by the reflection-job.';
COMMENT ON COLUMN regime_stats.pair IS 'The trading pair.';
COMMENT ON COLUMN regime_stats.regime IS 'The market regime.';
COMMENT ON COLUMN regime_stats.n_trades IS 'The number of trades in the window.';
COMMENT ON COLUMN regime_stats.win_rate IS 'The share of profitable ones 0–1.';
COMMENT ON COLUMN regime_stats.avg_r IS 'The mean R multiple.';
COMMENT ON COLUMN regime_stats.avg_pnl_pct IS 'The mean PnL, %.';
COMMENT ON COLUMN regime_stats.median_hold IS 'The median holding, in bars.';
COMMENT ON COLUMN regime_stats.updated_at IS 'The update time.';
