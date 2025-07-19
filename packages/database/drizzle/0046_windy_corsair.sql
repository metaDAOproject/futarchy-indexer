ALTER TABLE "v0_5_daos" RENAME COLUMN "initial_spending_limit" TO "spending_limit_amount_per_month";--> statement-breakpoint
ALTER TABLE "v0_5_daos" ADD COLUMN "spending_limit_members" jsonb;