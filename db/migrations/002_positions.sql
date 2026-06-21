-- 002_positions — trading positions (aggregate of fills from orders). One active LONG and one active SHORT per pair.
CREATE TABLE positions (
    id                BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    pair              varchar(10) NOT NULL,
    side              varchar(5) NOT NULL,
    status            varchar(10) NOT NULL DEFAULT 'active',
    status_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_size       numeric(38,18),
    opened_amount     numeric(38,18) NOT NULL,
    opened_price      numeric(38,18),
    closed_size       numeric(38,18),
    closed_amount     numeric(38,18),
    closed_price      numeric(38,18),
    realized_pnl_usd  numeric(38,18),
    realized_pnl_pct  numeric(12,6),
    reason            TEXT,
    force_closed      BOOLEAN NOT NULL DEFAULT FALSE,
    regime_at_entry   varchar(12) NOT NULL,
    features_at_entry JSONB NOT NULL,
    expected_move_pct numeric(12,6),
    params_version    INTEGER NOT NULL REFERENCES params(version)
);
CREATE UNIQUE INDEX positions_one_active_per_side ON positions (pair, side) WHERE status='active';
CREATE INDEX positions_pair_status ON positions (pair, status);
CREATE INDEX positions_status_at ON positions (status_at);

COMMENT ON TABLE positions IS 'Trading positions (aggregate of fills from orders). One active LONG and one active SHORT per pair.';
COMMENT ON COLUMN positions.id IS 'The position identifier.';
COMMENT ON COLUMN positions.created_at IS 'The position open time (the first order).';
COMMENT ON COLUMN positions.pair IS 'The trading pair, e.g. ETH/USDT.';
COMMENT ON COLUMN positions.side IS 'The direction: LONG/SHORT (currently we trade LONG only).';
COMMENT ON COLUMN positions.status IS 'active (open) / completed (fully closed) / cancelled (cancelled/error).';
COMMENT ON COLUMN positions.status_at IS 'The time of the last status change (for closed = the close time).';
COMMENT ON COLUMN positions.opened_size IS 'Total base coin at entry = SUM(comp_size) over open+add completed.';
COMMENT ON COLUMN positions.opened_amount IS 'Total USDT invested = SUM(comp_amount) over open+add completed.';
COMMENT ON COLUMN positions.opened_price IS 'The average entry price = opened_amount/opened_size.';
COMMENT ON COLUMN positions.closed_size IS 'Base coin at close = SUM(comp_size) over close completed.';
COMMENT ON COLUMN positions.closed_amount IS 'The USDT flow of the close = SUM(comp_amount) over close completed.';
COMMENT ON COLUMN positions.closed_price IS 'The average close price = closed_amount/closed_size.';
COMMENT ON COLUMN positions.realized_pnl_usd IS 'Realized PnL, USDT (cost-basis on the sold share: closed_amount - opened_amount*(closed_size/opened_size); on a full close = closed_amount-opened_amount). SHORT is not supported → NULL.';
COMMENT ON COLUMN positions.realized_pnl_pct IS 'Realized PnL, % of the cost basis of the sold share (opened_amount*closed_size/opened_size).';
COMMENT ON COLUMN positions.reason IS 'The reason for the close/a note (free text).';
COMMENT ON COLUMN positions.force_closed IS 'A forced/anomalous close (hackathon finish/liquidation).';
COMMENT ON COLUMN positions.regime_at_entry IS 'The market regime at entry (for reflection).';
COMMENT ON COLUMN positions.features_at_entry IS 'A snapshot of indicators at entry (self-learning).';
COMMENT ON COLUMN positions.expected_move_pct IS 'The computed take-profit at entry (tp_mult*hv), %.';
COMMENT ON COLUMN positions.params_version IS 'The active parameter version at entry.';
