ALTER TABLE "conditional_vaults" RENAME COLUMN "underlying_token_account" TO "underlying_token_acct";--> statement-breakpoint
ALTER TABLE "conditional_vaults" ALTER COLUMN "nonce" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "conditional_vaults" ALTER COLUMN "nonce" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_base_vault_conditional_vaults_cond_vault_acct_fk" FOREIGN KEY ("base_vault") REFERENCES "conditional_vaults"("cond_vault_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_quote_vault_conditional_vaults_cond_vault_acct_fk" FOREIGN KEY ("quote_vault") REFERENCES "conditional_vaults"("cond_vault_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
