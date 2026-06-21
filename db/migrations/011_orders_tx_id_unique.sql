-- 011_orders_tx_id_unique — one tx_id cannot be written to TWO orders (protection against doubling amounts).
-- The intent: fill_order trusts the tx_id from the agent. If the LLM errs and passes one hash for two orders,
-- both would read the same receipt and double comp_*. A partial UNIQUE index (only where tx_id is set)
-- closes this class of errors at the DB level — a second fill with the same tx_id is rejected (23505).
CREATE UNIQUE INDEX orders_tx_id_unique ON orders (tx_id) WHERE tx_id IS NOT NULL;

COMMENT ON INDEX orders_tx_id_unique IS 'One tx_id — one order (protection against a double fill with one transaction). Partial: only where tx_id is not NULL.';
