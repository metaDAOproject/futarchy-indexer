DROP VIEW IF EXISTS twap_chart_data;
DROP VIEW IF EXISTS prices_chart_data;
DROP VIEW IF EXISTS proposal_total_trade_volume;

ALTER TABLE "candles" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "timestamp" AT TIME ZONE 'UTC';
ALTER TABLE "comments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "daos" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "daos" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "indexer_account_dependencies" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "makes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "markets" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "orders" ALTER COLUMN "order_time" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "order_time" AT TIME ZONE 'UTC';
ALTER TABLE "orders" ALTER COLUMN "cancel_time" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "cancel_time" AT TIME ZONE 'UTC';
ALTER TABLE "prices" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "programs" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "proposals" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "proposals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "proposals" ALTER COLUMN "ended_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "ended_at" AT TIME ZONE 'UTC';
ALTER TABLE "proposals" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "reactions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "takes" ALTER COLUMN "order_time" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "order_time" AT TIME ZONE 'UTC';
ALTER TABLE "token_acct_balances" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "token_accts" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "tokens" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "transaction_watchers" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "transactions" ALTER COLUMN "block_time" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "block_time" AT TIME ZONE 'UTC';
ALTER TABLE "twaps" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone--> statement-breakpoint
USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone
USING "created_at" AT TIME ZONE 'UTC';

CREATE OR REPLACE VIEW public."twap_chart_data" AS
  SELECT
      TIME_BUCKET('30 SECONDS'::INTERVAL, twaps.created_at) AS interv,
      last(token_amount, twaps.created_at) FILTER(WHERE twaps.created_at IS NOT NULL AND twaps.created_at <= markets.created_at + '5 DAYS'::INTERVAL) AS token_amount,
      twaps.market_acct AS market_acct
  FROM twaps
  JOIN markets ON markets.market_acct = twaps.market_acct
  WHERE twaps.created_at <= markets.created_at + '5 DAYS'::INTERVAL
  GROUP BY interv, twaps.market_acct;

CREATE OR REPLACE VIEW public."prices_chart_data" AS 
  SELECT
      TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
      last(price, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS price,
      last(base_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS base_amount,
      last(quote_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END) AS quote_amount,
      prices_type,
      prices.market_acct AS market_acct
  FROM prices
  JOIN markets ON markets.market_acct = prices.market_acct
  WHERE CASE WHEN prices_type = 'spot' THEN TRUE ELSE prices.created_at <= markets.created_at + '5 DAYS'::INTERVAL END
  GROUP BY interv, prices.market_acct, prices_type;


CREATE OR REPLACE VIEW public."proposal_total_trade_volume" AS 
  WITH pass_market AS (
    SELECT
    	  proposal_acct,
    	  orders.market_acct AS pass_market_acct,
          TIME_BUCKET('1 DAYS'::INTERVAL, orders.order_time) AS interv,
          SUM(filled_base_amount * quote_price) FILTER(WHERE orders.order_time IS NOT NULL) AS pass_volume
    FROM proposals
    JOIN orders
    ON proposals.pass_market_acct = orders.market_acct
    GROUP BY proposal_acct, interv, orders.market_acct
  ),
  fail_market AS (
    SELECT
    	  proposal_acct,
    	  orders.market_acct AS fail_market_acct,
          TIME_BUCKET('1 DAYS'::INTERVAL, orders.order_time) AS interv,
          SUM(filled_base_amount * quote_price) FILTER(WHERE orders.order_time IS NOT NULL) AS fail_volume
    FROM proposals
    JOIN orders
    ON proposals.fail_market_acct = orders.market_acct
    GROUP BY proposal_acct, interv, orders.market_acct
  )
  SELECT
    pass_market.proposal_acct AS proposal_acct,
    pass_market_acct,
    fail_market_acct,
    SUM(pass_volume) AS pass_volume,
    SUM(fail_volume) AS fail_volume
  FROM pass_market
  JOIN fail_market ON fail_market.proposal_acct = pass_market.proposal_acct
  GROUP BY pass_market.proposal_acct, pass_market_acct, fail_market_acct;