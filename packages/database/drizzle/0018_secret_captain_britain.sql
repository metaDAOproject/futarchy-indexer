ALTER TABLE "daos" ALTER COLUMN "quote_acct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "pass_market_acct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "fail_market_acct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "base_vault" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "quote_vault" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "metric_threshold" numeric;