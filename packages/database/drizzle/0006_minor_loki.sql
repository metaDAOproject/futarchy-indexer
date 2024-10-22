ALTER TABLE "proposals" ALTER COLUMN "twap_initial_observation" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "twap_max_observation_change_per_update" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "min_quote_futarchic_liquidity" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "min_base_futarchic_liquidity" SET DATA TYPE numeric;