-- 001_params — versioned strategy parameters per pair (all configuration in config JSONB).
CREATE TABLE params (
    version        INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    pair           varchar(10) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT FALSE,
    parent_version INTEGER REFERENCES params(version),
    source         varchar(20) NOT NULL DEFAULT 'seed',
    reason         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    config         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX params_one_active ON params (pair) WHERE is_active;

COMMENT ON TABLE params IS 'Versioned strategy parameters PER PAIR; exactly one active version per pair (all configuration in config JSONB).';
COMMENT ON COLUMN params.version IS 'PK, auto-increment from 1001 — the parameter version number (shared across all pairs).';
COMMENT ON COLUMN params.pair IS 'The trading pair of the version (e.g. ETH/USDT).';
COMMENT ON COLUMN params.is_active IS 'The active version for the pair — exactly one per pair (unique index params_one_active).';
COMMENT ON COLUMN params.parent_version IS 'The parent version (change history / rollback).';
COMMENT ON COLUMN params.source IS 'The version source: seed | reflection | human | rollback.';
COMMENT ON COLUMN params.reason IS 'The version justification.';
COMMENT ON COLUMN params.created_at IS 'The version creation time.';
COMMENT ON COLUMN params.config IS 'The strategy JSONB config: strategy, side_mode, sizes_usd, tp_mult, adx_lo/hi, avg1_depth_mult_lo/hi, avg2_depth_mult, max_adds, crsi_buy/crsi_sell (per-pair), crsi_rsi_period/crsi_streak_period/crsi_rank_period, crsi_prev_max_age_min, hackathon_end.';
