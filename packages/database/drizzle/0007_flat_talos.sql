ALTER TABLE "tokens" ALTER COLUMN "decimals" SET DATA TYPE smallint;--> statement-breakpoint
ALTER TABLE "transaction_watchers" ADD COLUMN "first_tx_sig" varchar(88);--> statement-breakpoint
ALTER TABLE "transaction_watchers" ADD COLUMN "serializer_logic_version" smallint NOT NULL;