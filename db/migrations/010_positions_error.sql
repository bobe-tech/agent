-- 010_positions_error — a flag for a "broken" position (a pause with an error for manual investigation).
-- The position stays status='active' (the unique index positions_one_active_per_side blocks
-- a new open on the pair), but error=true signals the agent NOT to touch it (HOLD), and the human — to investigate.
-- The reason is written to the existing reason field. The main case: fill_order could not read the swap receipt
-- from the blockchain after retries → the amounts are unknown → the position goes to error + an alert in Telegram.
ALTER TABLE positions ADD COLUMN error BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN positions.error IS 'A position in error (paused for manual investigation): the swap amounts could not be obtained from the blockchain. It stays active, but the agent does not manage it.';
