ALTER TABLE "v0_5_daos" RENAME COLUMN "initial_spending_limit" TO "amount_per_month";--> statement-breakpoint
ALTER TABLE "v0_5_daos" ADD COLUMN "members" jsonb;