-- 008_params_perf — the performance of a params version on a window (for auto-rollback).
CREATE TABLE params_perf (
    id               BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    params_version   INTEGER NOT NULL REFERENCES params(version),
    window_from      TIMESTAMPTZ NOT NULL,
    window_to        TIMESTAMPTZ NOT NULL,
    n_trades         INTEGER NOT NULL,
    avg_r            NUMERIC,
    max_drawdown_pct NUMERIC,
    evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX params_perf_version ON params_perf (params_version);
COMMENT ON TABLE params_perf IS 'The performance of a params version on the next window (for reflection auto-rollback).';
COMMENT ON COLUMN params_perf.id IS 'The record identifier.';
COMMENT ON COLUMN params_perf.params_version IS 'The parameter version being evaluated.';
COMMENT ON COLUMN params_perf.window_from IS 'The start of the evaluation window.';
COMMENT ON COLUMN params_perf.window_to IS 'The end of the evaluation window.';
COMMENT ON COLUMN params_perf.n_trades IS 'The number of trades in the window.';
COMMENT ON COLUMN params_perf.avg_r IS 'The mean R on the window.';
COMMENT ON COLUMN params_perf.max_drawdown_pct IS 'The max drawdown, %.';
COMMENT ON COLUMN params_perf.evaluated_at IS 'The evaluation time.';
