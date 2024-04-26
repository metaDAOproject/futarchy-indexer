CREATE TABLE IF NOT EXISTS "conditional_vaults" (
	"cond_vault_acct" varchar(44) PRIMARY KEY NOT NULL,
	"status" varchar,
	"settlement_authority" varchar(44) NOT NULL,
	"underlying_mint_acct" varchar(44) NOT NULL,
	"underlying_token_account" varchar(44) NOT NULL,
	"nonce" bigint NOT NULL,
	"cond_finalize_token_mint_acct" varchar(44) NOT NULL,
	"cond_revert_token_mint_acct" varchar(44) NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conditional_vaults" ADD CONSTRAINT "conditional_vaults_settlement_authority_daos_treasury_acct_fk" FOREIGN KEY ("settlement_authority") REFERENCES "daos"("treasury_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conditional_vaults" ADD CONSTRAINT "conditional_vaults_underlying_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("underlying_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
