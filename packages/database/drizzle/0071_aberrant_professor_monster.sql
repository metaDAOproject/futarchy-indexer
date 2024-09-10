CREATE TABLE IF NOT EXISTS "v0_4_amm" (
	"amm_addr" varchar(44) PRIMARY KEY NOT NULL,
	"created_at_slot" bigint NOT NULL,
	"lp_mint_addr" varchar(44) NOT NULL,
	"base_mint_addr" varchar(44) NOT NULL,
	"quote_mint_addr" varchar(44) NOT NULL,
	"base_reserves" bigint NOT NULL,
	"quote_reserves" bigint NOT NULL,
	"latest_signature_applied" varchar(88),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- DO $$ BEGIN
--  ALTER TABLE "v0_4_amm" ADD CONSTRAINT "v0_4_amm_latest_signature_applied_signatures_signature_fk" FOREIGN KEY ("latest_signature_applied") REFERENCES "signatures"("signature") ON DELETE no action ON UPDATE no action;
-- EXCEPTION
--  WHEN duplicate_object THEN null;
-- END $$;
