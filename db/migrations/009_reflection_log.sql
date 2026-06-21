-- 009_reflection_log — the reflection-job output journal (for visibility to a human in Telegram).
CREATE TABLE reflection_log (
    id      BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    pair    varchar(10) NOT NULL,
    ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary TEXT NOT NULL,
    payload JSONB
);
CREATE INDEX reflection_log_pair_ts ON reflection_log (pair, ts);
COMMENT ON TABLE reflection_log IS 'The reflection-job output journal (a human-readable summary + an optional JSON of the report). The tick-agent does NOT read it.';
COMMENT ON COLUMN reflection_log.id IS 'The record identifier.';
COMMENT ON COLUMN reflection_log.pair IS 'The trading pair.';
COMMENT ON COLUMN reflection_log.ts IS 'The record time.';
COMMENT ON COLUMN reflection_log.summary IS 'The human-readable summary (goes to Telegram).';
COMMENT ON COLUMN reflection_log.payload IS 'The full JSON of the reflection report (opt.).';
