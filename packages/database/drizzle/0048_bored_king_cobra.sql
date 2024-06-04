CREATE TABLE IF NOT EXISTS "proposal_bars" (
	"proposal_acct" varchar(44),
	"bar_size" interval,
	"bar_start_time" timestamp (6) with time zone,
	"pass_market_acct" varchar(44),
	"pass_price" numeric(40, 20),
	"pass_base_amount" bigint,
	"pass_quote_amount" bigint,
	"fail_market_acct" varchar(44),
	"fail_price" numeric(40, 20),
	"fail_base_amount" bigint,
	"fail_quote_amount" bigint,
	CONSTRAINT "proposal_bars_proposal_acct_bar_size_bar_start_time_pk" PRIMARY KEY("proposal_acct","bar_size","bar_start_time")
);
--> statement-breakpoint
DROP TABLE "proposal_conditional_liquidity_data";--> statement-breakpoint
DROP TABLE "proposal_conditional_price_data";--> statement-breakpoint
DROP TABLE "spot_price_data";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_bars" ADD CONSTRAINT "proposal_bars_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_bars" ADD CONSTRAINT "proposal_bars_pass_market_acct_markets_market_acct_fk" FOREIGN KEY ("pass_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_bars" ADD CONSTRAINT "proposal_bars_fail_market_acct_markets_market_acct_fk" FOREIGN KEY ("fail_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
