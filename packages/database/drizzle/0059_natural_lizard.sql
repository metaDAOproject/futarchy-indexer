CREATE TABLE IF NOT EXISTS "user_deposits" (
	"tx_sig" varchar(88) NOT NULL,
	"user_acct" varchar(44) NOT NULL,
	"token_amount" bigint NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_deposits" ADD CONSTRAINT "user_deposits_mint_acct_conditional_vaults_underlying_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "conditional_vaults"("underlying_mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
