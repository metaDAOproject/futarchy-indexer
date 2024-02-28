CREATE TABLE IF NOT EXISTS "transaction_watchers" (
	"acct" varchar(44) PRIMARY KEY NOT NULL,
	"latest_tx_sig" varchar(88),
	"description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD PRIMARY KEY ("sig");--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "failed" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payload" text NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slot_index" ON "transactions" ("slot");--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "acct";