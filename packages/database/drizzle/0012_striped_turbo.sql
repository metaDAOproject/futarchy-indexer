ALTER TABLE "dao_details" ADD COLUMN "base_mint" varchar(44);--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "quote_mint" varchar(44);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dao_details" ADD CONSTRAINT "dao_details_base_mint_tokens_mint_acct_fk" FOREIGN KEY ("base_mint") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dao_details" ADD CONSTRAINT "dao_details_quote_mint_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint") REFERENCES "public"."tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
