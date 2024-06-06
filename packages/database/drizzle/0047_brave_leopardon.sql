CREATE TABLE IF NOT EXISTS "proposal_conditional_liquidity_data" (
	"created_at" timestamp (6) with time zone,
	"proposal_acct" varchar(44),
	"pass_market_acct" varchar(44),
	"pass_market_base_amount" bigint,
	"pass_market_quote_amount" bigint,
	"fail_market_acct" varchar(44),
	"fail_market_base_amount" bigint,
	"fail_market_quote_amount" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_conditional_price_data" (
	"created_at" timestamp (6) with time zone,
	"proposal_acct" varchar(44),
	"pass_market_acct" varchar(44),
	"pass_market_price" numeric(40, 20) NOT NULL,
	"fail_market_acct" varchar(44),
	"fail_market_price" numeric(40, 20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spot_price_data" (
	"created_at" timestamp (6) with time zone,
	"spot_price" numeric(40, 20) NOT NULL,
	"mint_acct" varchar(44)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_liquidity_data" ADD CONSTRAINT "proposal_conditional_liquidity_data_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_liquidity_data" ADD CONSTRAINT "proposal_conditional_liquidity_data_pass_market_acct_markets_market_acct_fk" FOREIGN KEY ("pass_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_liquidity_data" ADD CONSTRAINT "proposal_conditional_liquidity_data_fail_market_acct_markets_market_acct_fk" FOREIGN KEY ("fail_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_price_data" ADD CONSTRAINT "proposal_conditional_price_data_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_price_data" ADD CONSTRAINT "proposal_conditional_price_data_pass_market_acct_markets_market_acct_fk" FOREIGN KEY ("pass_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_conditional_price_data" ADD CONSTRAINT "proposal_conditional_price_data_fail_market_acct_markets_market_acct_fk" FOREIGN KEY ("fail_market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spot_price_data" ADD CONSTRAINT "spot_price_data_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
