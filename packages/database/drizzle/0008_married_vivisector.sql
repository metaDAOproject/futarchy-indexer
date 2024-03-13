ALTER TABLE "transactions" ADD COLUMN "serializer_logic_version" smallint NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_first_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("first_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
