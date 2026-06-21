-- 003_orders — the trade (fill) journal. The source of truth for money; positions aggregates = SUM of completed orders.
CREATE TABLE orders (
    id             BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    position_id    BIGINT NOT NULL REFERENCES positions(id),
    pair           varchar(10) NOT NULL,
    side           varchar(5) NOT NULL,
    action         varchar(5) NOT NULL,
    status         varchar(10) NOT NULL DEFAULT 'active',
    status_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    start_size     numeric(38,18),
    start_amount   numeric(38,18),
    start_price    numeric(38,18),
    comp_size      numeric(38,18) NOT NULL DEFAULT 0,
    comp_amount    numeric(38,18) NOT NULL DEFAULT 0,
    comp_price     numeric(38,18),
    tx_id          TEXT,
    params_version INTEGER NOT NULL REFERENCES params(version),
    quote          JSONB,
    reason         TEXT
);
CREATE UNIQUE INDEX orders_one_active_per_position ON orders (position_id) WHERE status='active';
CREATE INDEX orders_position_id ON orders (position_id);
CREATE INDEX orders_pair_action ON orders (pair, action);
CREATE INDEX orders_status_at ON orders (status_at);

COMMENT ON TABLE orders IS 'The trade (fill) journal. The source of truth for money; positions aggregates are recomputed from completed orders.';
COMMENT ON COLUMN orders.id IS 'The order identifier.';
COMMENT ON COLUMN orders.created_at IS 'The order creation time (the intent, before the swap).';
COMMENT ON COLUMN orders.position_id IS 'The position the order belongs to.';
COMMENT ON COLUMN orders.pair IS 'The trading pair (denorm. for filtering without a join).';
COMMENT ON COLUMN orders.side IS 'The position side (denorm.).';
COMMENT ON COLUMN orders.action IS 'open (the first leg) / add (averaging) / close (closing).';
COMMENT ON COLUMN orders.status IS 'active (intent created) / completed (swap went through) / cancelled (did not go through/cancelled).';
COMMENT ON COLUMN orders.status_at IS 'The time of the last status change.';
COMMENT ON COLUMN orders.start_size IS 'The desired base coin volume.';
COMMENT ON COLUMN orders.start_amount IS 'The desired USDT amount.';
COMMENT ON COLUMN orders.start_price IS 'The desired price.';
COMMENT ON COLUMN orders.comp_size IS 'Actually executed base coin (from the swap receipt).';
COMMENT ON COLUMN orders.comp_amount IS 'Actually executed USDT (from the swap receipt).';
COMMENT ON COLUMN orders.comp_price IS 'The actual price = comp_amount/comp_size.';
COMMENT ON COLUMN orders.tx_id IS 'The swap transaction hash (null until the swap is filled).';
COMMENT ON COLUMN orders.params_version IS 'The parameter version at the time of the order.';
COMMENT ON COLUMN orders.quote IS 'A snapshot of the twak quote (audit).';
COMMENT ON COLUMN orders.reason IS 'For cancelled orders / notes.';
