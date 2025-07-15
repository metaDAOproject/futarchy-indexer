ALTER TABLE "v0_5_launches" ADD COLUMN "monthly_spending_limit_amount" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_5_launches" ADD COLUMN "monthly_spending_limit_members" varchar(44)[];