ALTER TABLE "v0_4_launches" ALTER COLUMN "dao_addr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_launches" ALTER COLUMN "dao_treasury_addr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_launches" ALTER COLUMN "treasury_usdc_acct" DROP NOT NULL;