-- 007_lessons — distilled heuristics by (pair, regime) (written by the reflection-job).
CREATE TABLE lessons (
    id          BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    pair        varchar(10) NOT NULL,
    regime      varchar(12),
    text        TEXT NOT NULL,
    confidence  NUMERIC NOT NULL DEFAULT 0.5,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lessons_pair_regime ON lessons (pair, regime, active, confidence DESC);
COMMENT ON TABLE lessons IS 'Distilled heuristics (lessons) by (pair, regime); written by the reflection-job, read by the tick-agent.';
COMMENT ON COLUMN lessons.id IS 'The lesson identifier.';
COMMENT ON COLUMN lessons.pair IS 'The trading pair.';
COMMENT ON COLUMN lessons.regime IS 'The regime (NULL = a global lesson for the pair).';
COMMENT ON COLUMN lessons.text IS 'A short heuristic.';
COMMENT ON COLUMN lessons.confidence IS 'The confidence 0–1.';
COMMENT ON COLUMN lessons.active IS 'Whether the lesson is active.';
COMMENT ON COLUMN lessons.created_at IS 'The creation time.';
COMMENT ON COLUMN lessons.updated_at IS 'The update time.';
