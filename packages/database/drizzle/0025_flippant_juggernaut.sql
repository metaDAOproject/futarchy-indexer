ALTER TABLE "transaction_watchers" ALTER COLUMN "status" SET DEFAULT 'disabled';--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "creator_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "admin_accts" jsonb;--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "token_image_url" varchar;--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "pass_token_image_url" varchar;--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "fail_token_image_url" varchar;--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "lp_token_image_url" varchar;--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "proposer_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "base_cond_vault_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "quote_cond_vault_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "pass_market_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "fail_market_acct" varchar(44);