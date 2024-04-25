CREATE TABLE IF NOT EXISTS "program_system" (
	"system_version" double precision PRIMARY KEY NOT NULL,
	"autocrat_acct" varchar(44) NOT NULL,
	"conditional_vault_acct" varchar(44) NOT NULL,
	"pricing_model_acct" varchar(44) NOT NULL,
	"migrator_acct" varchar(44)
);
--> statement-breakpoint
ALTER TABLE "daos" RENAME COLUMN "mint_acct" TO "base_acct";--> statement-breakpoint
ALTER TABLE "daos" DROP CONSTRAINT "daos_mint_acct_tokens_mint_acct_fk";
--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "quote_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "treasury_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pricing_model_pass_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pricing_model_fail_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pass_market_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "fail_market_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "base_vault" varchar(44);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "quote_vault" varchar(44);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_base_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_quote_acct_tokens_mint_acct_fk" FOREIGN KEY ("quote_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_autocrat_acct_programs_program_acct_fk" FOREIGN KEY ("autocrat_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_conditional_vault_acct_programs_program_acct_fk" FOREIGN KEY ("conditional_vault_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_pricing_model_acct_programs_program_acct_fk" FOREIGN KEY ("pricing_model_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_system" ADD CONSTRAINT "program_system_migrator_acct_programs_program_acct_fk" FOREIGN KEY ("migrator_acct") REFERENCES "programs"("program_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
