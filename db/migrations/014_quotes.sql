-- 014_quotes — live bid/ask quotes per pair from twak (filled by the refresh-quotes cron once a minute).
-- The header and unrealized PnL read the freshest row; older rows are kept for history (pruned by retention).
CREATE TABLE quotes (
    pair       varchar(10) NOT NULL,
    ts         BIGINT      NOT NULL,
    bid        NUMERIC     NOT NULL,
    ask        NUMERIC     NOT NULL,
    mid        NUMERIC     NOT NULL,
    notional   NUMERIC     NOT NULL,
    provider   varchar(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pair, ts)
);

COMMENT ON TABLE quotes IS 'Live twak bid/ask quotes per pair (filled by the refresh-quotes cron). The header and unrealized PnL read only the latest row.';
COMMENT ON COLUMN quotes.pair IS 'The trading pair.';
COMMENT ON COLUMN quotes.ts IS 'Unix seconds of the quote.';
COMMENT ON COLUMN quotes.bid IS 'Sell price (base -> USDT swap quote).';
COMMENT ON COLUMN quotes.ask IS 'Buy price (USDT -> base swap quote).';
COMMENT ON COLUMN quotes.mid IS '(bid + ask) / 2.';
COMMENT ON COLUMN quotes.notional IS 'USD notional used for the quote.';
COMMENT ON COLUMN quotes.provider IS 'twak route provider (e.g. LiquidMesh).';
COMMENT ON COLUMN quotes.created_at IS 'Row insertion time.';
