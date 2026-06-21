-- 005_candles — 1h candles per pair (filled by the refresh-candles cron); the API reads only from the DB.
CREATE TABLE candles (
    pair       varchar(10) NOT NULL,
    tf         varchar(5)  NOT NULL,
    ts         BIGINT      NOT NULL,
    open       NUMERIC NOT NULL,
    high       NUMERIC NOT NULL,
    low        NUMERIC NOT NULL,
    close      NUMERIC NOT NULL,
    volume     NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pair, tf, ts)
);
-- A separate index on (pair,tf,ts) is not needed — the PRIMARY KEY already covers it.

COMMENT ON TABLE candles IS 'OHLCV candles per pair/timeframe (filled by the refresh-candles cron from GeckoTerminal). The API and getMarket read only from here.';
COMMENT ON COLUMN candles.pair IS 'The trading pair.';
COMMENT ON COLUMN candles.tf IS 'The timeframe (1h).';
COMMENT ON COLUMN candles.ts IS 'Unix seconds of the bar open time, UTC.';
COMMENT ON COLUMN candles.open IS 'The open price.';
COMMENT ON COLUMN candles.high IS 'The high.';
COMMENT ON COLUMN candles.low IS 'The low.';
COMMENT ON COLUMN candles.close IS 'The close price.';
COMMENT ON COLUMN candles.volume IS 'The volume (may be null).';
COMMENT ON COLUMN candles.created_at IS 'The row insertion time.';
COMMENT ON COLUMN candles.updated_at IS 'The time of the last upsert.';
