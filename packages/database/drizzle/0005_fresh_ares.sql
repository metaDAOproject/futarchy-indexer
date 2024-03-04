CREATE TABLE IF NOT EXISTS "indexer_account_dependencies" (
	"name" varchar(100) NOT NULL,
	"acct" varchar(44) NOT NULL,
	"latest_tx_sig_processed" varchar(88),
	CONSTRAINT indexer_account_dependencies_name_acct PRIMARY KEY("name","acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indexers" (
	"name" varchar(100) PRIMARY KEY NOT NULL,
	"implementation" varchar NOT NULL,
	"latest_slot_processed" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_watcher_transactions" (
	"watcher_acct" varchar(44) NOT NULL,
	"tx_sig" varchar(88) NOT NULL,
	"slot" bigint NOT NULL,
	CONSTRAINT transaction_watcher_transactions_watcher_acct_tx_sig PRIMARY KEY("watcher_acct","tx_sig")
);
--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "sig" TO "tx_sig";--> statement-breakpoint
ALTER TABLE "transaction_watchers" ADD COLUMN "latest_slot" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slot_index" ON "transaction_watcher_transactions" ("watcher_acct","slot");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_latest_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("latest_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "processed";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_name_indexers_name_fk" FOREIGN KEY ("name") REFERENCES "indexers"("name") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_acct_transaction_watchers_acct_fk" FOREIGN KEY ("acct") REFERENCES "transaction_watchers"("acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_latest_tx_sig_processed_transactions_tx_sig_fk" FOREIGN KEY ("latest_tx_sig_processed") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watcher_transactions" ADD CONSTRAINT "transaction_watcher_transactions_watcher_acct_transaction_watchers_acct_fk" FOREIGN KEY ("watcher_acct") REFERENCES "transaction_watchers"("acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watcher_transactions" ADD CONSTRAINT "transaction_watcher_transactions_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
