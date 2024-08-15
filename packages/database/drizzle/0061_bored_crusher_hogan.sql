ALTER TABLE "daos" ADD COLUMN "twap_initial_observation" bigint;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "min_quote_futarchic_liquidity" bigint;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "min_base_futarchic_liquidity" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "duration_in_slots" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pass_threshold_bps" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "twap_initial_observation" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "min_quote_futarchic_liquidity" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "min_base_futarchic_liquidity" bigint;