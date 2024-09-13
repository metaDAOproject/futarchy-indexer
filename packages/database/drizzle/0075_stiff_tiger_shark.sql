ALTER TABLE "v0_4_amm" RENAME TO "v0_4_amms";--> statement-breakpoint
ALTER TABLE "v0_4_amms" RENAME COLUMN "created_at" TO "inserted_at";--> statement-breakpoint
ALTER TABLE "v0_4_amms" DROP CONSTRAINT "v0_4_amm_latest_seq_num_applied_signatures_sequence_num_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_lp_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("lp_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_base_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amms" ADD CONSTRAINT "v0_4_amms_quote_mint_addr_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_addr") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "v0_4_amms" DROP COLUMN IF EXISTS "latest_seq_num_applied";