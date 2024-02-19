CREATE TABLE IF NOT EXISTS "candles" (
	"market_acct" varchar(44) NOT NULL,
	"candle_duration" integer NOT NULL,
	"timestamp" timestamp NOT NULL,
	"volume" bigint NOT NULL,
	"open" bigint,
	"high" bigint,
	"low" bigint,
	"close" bigint,
	"average" bigint NOT NULL,
	CONSTRAINT candles_market_acct_candle_duration_timestamp PRIMARY KEY("market_acct","candle_duration","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "makes" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"market_acct" varchar(44) NOT NULL,
	"is_active" boolean NOT NULL,
	"unfilled_base_amount" bigint NOT NULL,
	"filled_base_amount" bigint NOT NULL,
	"quote_price" bigint NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"market_acct" varchar(44) PRIMARY KEY NOT NULL,
	"proposal_acct" varchar(44),
	"market_type" varchar NOT NULL,
	"create_tx_sig" varchar(88) NOT NULL,
	"base_mint_acct" varchar(44) NOT NULL,
	"quote_mint_acct" varchar(44) NOT NULL,
	"base_lot_size" bigint NOT NULL,
	"quote_lot_size" bigint NOT NULL,
	"quote_tick_size" bigint NOT NULL,
	"bids_token_acct" varchar(44) NOT NULL,
	"asks_token_acct" varchar(44) NOT NULL,
	"base_maker_fee" smallint NOT NULL,
	"base_taker_fee" smallint NOT NULL,
	"quote_maker_fee" smallint NOT NULL,
	"quote_taker_fee" smallint NOT NULL,
	"active_slot" bigint,
	"inactive_slot" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"market_acct" varchar(44) NOT NULL,
	"actor_acct" varchar(44) NOT NULL,
	"side" varchar NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_active" boolean NOT NULL,
	"unfilled_base_amount" bigint NOT NULL,
	"filled_base_amount" bigint NOT NULL,
	"quote_price" bigint NOT NULL,
	"order_block" bigint NOT NULL,
	"order_time" timestamp NOT NULL,
	"cancel_tx_sig" varchar(88),
	"cancel_block" bigint,
	"cancel_time" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"proposal_acct" varchar(44) PRIMARY KEY NOT NULL,
	"proposal_num" bigint NOT NULL,
	"autocrat_version" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "takes" (
	"order_tx_sig" varchar(88) PRIMARY KEY NOT NULL,
	"base_amount" bigint NOT NULL,
	"quote_price" bigint NOT NULL,
	"taker_base_fee" bigint NOT NULL,
	"maker_quote_fee" bigint,
	"maker_order_tx_sig" varchar(88),
	"maker_base_fee" bigint,
	"market_acct" varchar(44) NOT NULL,
	"order_block" bigint NOT NULL,
	"order_time" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_accts" (
	"token_acct" varchar(44) PRIMARY KEY NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"owner_acct" varchar(44) NOT NULL,
	"amount" bigint NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens" (
	"mint_acct" varchar(44) PRIMARY KEY NOT NULL,
	"name" varchar(30) NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"supply" bigint NOT NULL,
	"decimals" serial NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_index" ON "makes" ("market_acct");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actor_index" ON "orders" ("market_acct","actor_acct");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_index" ON "takes" ("market_acct","order_block");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_index" ON "takes" ("market_acct","order_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maker_index" ON "takes" ("maker_order_tx_sig");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candles" ADD CONSTRAINT "candles_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "makes" ADD CONSTRAINT "makes_order_tx_sig_orders_order_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "orders"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "makes" ADD CONSTRAINT "makes_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_base_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("base_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_quote_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("quote_mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_bids_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("bids_token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markets" ADD CONSTRAINT "markets_asks_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("asks_token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_order_tx_sig_orders_order_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "orders"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_maker_order_tx_sig_makes_order_tx_sig_fk" FOREIGN KEY ("maker_order_tx_sig") REFERENCES "makes"("order_tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "takes" ADD CONSTRAINT "takes_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_accts" ADD CONSTRAINT "token_accts_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
