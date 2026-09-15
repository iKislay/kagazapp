-- ============================================================
-- Everything in §16 that Prisma will not generate.
--
-- Run `pnpm db:migrate:sql ledger_trigger_and_views` to stamp this into a
-- timestamped migration folder AFTER the generated init migration, then
-- `pnpm db:migrate` to apply it.
--
-- Statements are separated by `--> statement-breakpoint` so the down-migration
-- runner can execute them one at a time.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ledger balance enforcement.
--
-- Enforced in the database, not in application code, because the ledger is the
-- one thing in this system that must never be wrong — and application code is
-- the thing most likely to change. DEFERRABLE INITIALLY DEFERRED means the
-- check runs at COMMIT, so a transaction may insert its debit and its credit
-- in any order and still pass.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS TRIGGER AS $$
DECLARE s BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_paise),0) INTO s
  FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % does not balance: sum=%', NEW.transaction_id, s;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ledger_balance_check ON ledger_entries;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ledger_balance_check
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();
--> statement-breakpoint

-- ------------------------------------------------------------
-- 2. Wallet balance view.
--
-- A shop's wallet balance is always derived from the ledger. There is no
-- balance column anywhere, deliberately: a stored balance can drift, a derived
-- one cannot.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW shop_wallet_balances AS
SELECT account_ref AS shop_id, SUM(amount_paise) AS balance_paise
FROM ledger_entries
WHERE account_kind = 'shop_wallet'
GROUP BY account_ref;
--> statement-breakpoint

-- ------------------------------------------------------------
-- 3. Partial indexes.
--
-- Prisma cannot express a WHERE clause on an index. Each of these keeps a
-- hot polling query off a full table scan as the table grows.
-- ------------------------------------------------------------

-- The retention sweep (FR-39) only ever looks at files not yet deleted.
CREATE INDEX IF NOT EXISTS files_delete_after_pending_idx
  ON files (delete_after)
  WHERE deleted_at IS NULL;
--> statement-breakpoint

-- The operator dashboard and the stuck-order alarm only care about live
-- orders. Terminal orders are the overwhelming majority after a few months.
CREATE INDEX IF NOT EXISTS orders_status_live_idx
  ON orders (status)
  WHERE status NOT IN ('COMPLETED','REFUNDED','CANCELLED','EXPIRED');
--> statement-breakpoint

-- The job runner polls this every second or so.
CREATE INDEX IF NOT EXISTS job_queue_run_after_pending_idx
  ON job_queue (run_after)
  WHERE completed_at IS NULL;
