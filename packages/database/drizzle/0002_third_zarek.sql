CREATE TABLE IF NOT EXISTS "twaps" (
	"market_acct" varchar(44) NOT NULL,
	"proposal_acct" varchar(44) NOT NULL,
	"updated_slot" bigint NOT NULL,
	"observation_agg" numeric(40, 0) NOT NULL,
	"token_amount" bigint NOT NULL,
	CONSTRAINT twaps_market_acct_updated_slot PRIMARY KEY("market_acct","updated_slot")
);
--> statement-breakpoint
ALTER TABLE "candles" RENAME COLUMN "average" TO "candle_average";--> statement-breakpoint
ALTER TABLE "candles" ADD COLUMN "cond_market_twap" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "initial_slot" bigint NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "twaps" ADD CONSTRAINT "twaps_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "twaps" ADD CONSTRAINT "twaps_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
