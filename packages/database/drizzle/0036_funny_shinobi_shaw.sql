-- ALTER TABLE "dao_details" DROP CONSTRAINT "dao_details_base_mint_tokens_mint_acct_fk";
-- --> statement-breakpoint
-- ALTER TABLE "dao_details" DROP CONSTRAINT "dao_details_quote_mint_tokens_mint_acct_fk";
--> statement-breakpoint
ALTER TABLE "daos" ALTER COLUMN "quote_acct" SET NOT NULL;--> statement-breakpoint
-- ALTER TABLE "launch_details" ADD PRIMARY KEY ("launch_addr");--> statement-breakpoint
-- ALTER TABLE "proposal_details" ALTER COLUMN "proposal_id" SET DATA TYPE bigserial;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "pass_market_acct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "fail_market_acct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "base_vault" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "quote_vault" SET NOT NULL;--> statement-breakpoint
-- ALTER TABLE "dao_details" ADD COLUMN "dao_acct" varchar(44);--> statement-breakpoint
-- ALTER TABLE "dao_details" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- ALTER TABLE "dao_details" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- ALTER TABLE "organizations" ADD COLUMN "telegram_channel" text;--> statement-breakpoint
-- ALTER TABLE "proposal_details" ADD COLUMN "discussion_link" text;--> statement-breakpoint
-- ALTER TABLE "proposal_details" ADD COLUMN "state" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
-- ALTER TABLE "proposal_details" ADD COLUMN "summary" text;--> statement-breakpoint
-- ALTER TABLE "proposal_details" ADD COLUMN "organization_id" bigint;--> statement-breakpoint
-- ALTER TABLE "takes" ADD COLUMN "base_decimals" smallint;--> statement-breakpoint
-- ALTER TABLE "takes" ADD COLUMN "quote_decimals" smallint;--> statement-breakpoint
-- ALTER TABLE "users" ADD COLUMN "user_name" text;--> statement-breakpoint
-- ALTER TABLE "users" ADD COLUMN "image_url" text;--> statement-breakpoint
-- ALTER TABLE "v0_4_daos" ADD COLUMN "twap_start_delay_slots" bigint DEFAULT NULL;--> statement-breakpoint
-- ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "metric_threshold" numeric;--> statement-breakpoint
-- ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "discussion_link" text;--> statement-breakpoint
-- ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "state" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
-- ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "summary" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_details" ADD CONSTRAINT "proposal_details_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ALTER TABLE "users" ADD CONSTRAINT "users_user_name_unique" UNIQUE("user_name");