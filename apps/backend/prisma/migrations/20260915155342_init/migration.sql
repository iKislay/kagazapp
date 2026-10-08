-- CreateEnum
CREATE TYPE "shop_status" AS ENUM ('onboarding', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('uploading', 'uploaded', 'converting', 'converted', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'AWAITING_FILE', 'CONVERTING', 'CONVERSION_FAILED', 'QUOTED', 'PREFLIGHT_FAILED', 'AWAITING_PAYMENT', 'PAYMENT_FAILED', 'EXPIRED', 'PAID', 'AWAITING_APPROVAL', 'REJECTED', 'HELD', 'QUEUED', 'DISPATCHED', 'PRINTING', 'PRINTED', 'COMPLETED', 'PRINT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "account_kind" AS ENUM ('student_inflow', 'shop_wallet', 'kagaz_revenue', 'gateway_fees', 'refund_outflow');

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "gstin" TEXT,
    "status" "shop_status" NOT NULL DEFAULT 'onboarding',
    "rz_linked_account_id" TEXT,
    "rz_account_status" TEXT,
    "max_pages_per_order" INTEGER NOT NULL DEFAULT 100,
    "max_order_paise" INTEGER NOT NULL DEFAULT 50000,
    "approval_threshold_pages" INTEGER NOT NULL DEFAULT 50,
    "max_queue_depth" INTEGER NOT NULL DEFAULT 10,
    "secure_release" BOOLEAN NOT NULL DEFAULT false,
    "commission_bps" INTEGER NOT NULL DEFAULT 500,
    "commission_min_paise" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "card" JSONB NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name" TEXT,
    "os_version" TEXT,
    "app_version" TEXT,
    "token_hash" TEXT NOT NULL,
    "paired_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairing_codes" (
    "code" CHAR(8) NOT NULL,
    "shop_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pairing_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "system_name" TEXT NOT NULL,
    "display_name" TEXT,
    "supports_color" BOOLEAN NOT NULL DEFAULT false,
    "supports_duplex" BOOLEAN NOT NULL DEFAULT false,
    "paper_sizes" TEXT[] DEFAULT ARRAY['A4']::TEXT[],
    "is_network" BOOLEAN NOT NULL DEFAULT false,
    "snmp_host" INET,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenance_note" TEXT,
    "last_status" JSONB,
    "last_status_at" TIMESTAMPTZ(6),

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "display_name" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_sessions" (
    "phone_e164" TEXT NOT NULL,
    "shop_id" UUID,
    "state" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "order_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("phone_e164")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'uploading',
    "original_name" TEXT,
    "original_mime" TEXT,
    "original_bytes" BIGINT,
    "original_key" TEXT,
    "pdf_key" TEXT,
    "pdf_bytes" BIGINT,
    "pdf_sha256" TEXT,
    "page_count" INTEGER,
    "thumbnail_key" TEXT,
    "conversion_error" TEXT,
    "delete_after" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "short_code" TEXT NOT NULL,
    "token_number" INTEGER,
    "shop_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "file_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "color_mode" TEXT,
    "sides" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "page_range" TEXT,
    "pages_to_print" INTEGER,
    "sheets_to_print" INTEGER,
    "paper_size" TEXT NOT NULL DEFAULT 'A4',
    "rate_card_id" UUID,
    "price_breakdown" JSONB,
    "total_paise" INTEGER,
    "commission_paise" INTEGER,
    "shop_share_paise" INTEGER,
    "quote_expires_at" TIMESTAMPTZ(6),
    "assigned_printer_id" UUID,
    "preflight_result" JSONB,
    "dispatched_at" TIMESTAMPTZ(6),
    "printed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "failure_detail" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" BIGSERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rz_payment_link_id" TEXT,
    "rz_order_id" TEXT,
    "rz_payment_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT,
    "captured_at" TIMESTAMPTZ(6),
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "rz_refund_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "is_automatic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rz_transfers" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "rz_transfer_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "on_hold" BOOLEAN NOT NULL DEFAULT true,
    "released_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rz_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature_ok" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "process_error" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" UUID,
    "shop_id" UUID,
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_kind" "account_kind" NOT NULL,
    "account_ref" UUID,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_code_key" ON "shops"("code");

-- CreateIndex
CREATE INDEX "rate_cards_shop_id_effective_from_idx" ON "rate_cards"("shop_id", "effective_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_shop_id_version_key" ON "rate_cards"("shop_id", "version");

-- CreateIndex
CREATE INDEX "devices_shop_id_idx" ON "devices"("shop_id");

-- CreateIndex
CREATE INDEX "pairing_codes_shop_id_idx" ON "pairing_codes"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "printers_device_id_system_name_key" ON "printers"("device_id", "system_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_phone_e164_key" ON "students"("phone_e164");

-- CreateIndex
CREATE INDEX "bot_sessions_shop_id_idx" ON "bot_sessions"("shop_id");

-- CreateIndex
CREATE INDEX "files_student_id_idx" ON "files"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_short_code_key" ON "orders"("short_code");

-- CreateIndex
CREATE INDEX "orders_shop_id_created_at_idx" ON "orders"("shop_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_student_id_created_at_idx" ON "orders"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_file_id_idx" ON "orders"("file_id");

-- CreateIndex
CREATE INDEX "orders_rate_card_id_idx" ON "orders"("rate_card_id");

-- CreateIndex
CREATE INDEX "orders_assigned_printer_id_idx" ON "orders"("assigned_printer_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_id_idx" ON "order_events"("order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_rz_payment_id_key" ON "payments"("rz_payment_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_rz_refund_id_key" ON "refunds"("rz_refund_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rz_transfers_rz_transfer_id_key" ON "rz_transfers"("rz_transfer_id");

-- CreateIndex
CREATE INDEX "rz_transfers_order_id_idx" ON "rz_transfers"("order_id");

-- CreateIndex
CREATE INDEX "rz_transfers_shop_id_idx" ON "rz_transfers"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_order_id_idx" ON "ledger_transactions"("order_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_shop_id_idx" ON "ledger_transactions"("shop_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_kind_account_ref_idx" ON "ledger_entries"("account_kind", "account_ref");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "withdrawals_shop_id_idx" ON "withdrawals"("shop_id");

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_printer_id_fkey" FOREIGN KEY ("assigned_printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rz_transfers" ADD CONSTRAINT "rz_transfers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rz_transfers" ADD CONSTRAINT "rz_transfers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
