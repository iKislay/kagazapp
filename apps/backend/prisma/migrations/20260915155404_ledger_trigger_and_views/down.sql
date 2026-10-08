-- Reverses ledger_trigger_and_views.sql.
-- Statements are separated by `--> statement-breakpoint`.

DROP INDEX IF EXISTS job_queue_run_after_pending_idx;
--> statement-breakpoint

DROP INDEX IF EXISTS orders_status_live_idx;
--> statement-breakpoint

DROP INDEX IF EXISTS files_delete_after_pending_idx;
--> statement-breakpoint

DROP VIEW IF EXISTS shop_wallet_balances;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ledger_balance_check ON ledger_entries;
--> statement-breakpoint

DROP FUNCTION IF EXISTS assert_ledger_balanced();
