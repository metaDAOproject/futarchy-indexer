ALTER TABLE "token_acct_balances" ADD COLUMN "slot" bigint;--> statement-breakpoint
ALTER TABLE "token_acct_balances" ADD COLUMN "tx_sig" varchar(88);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
