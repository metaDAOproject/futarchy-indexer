ALTER TABLE "indexers" ADD COLUMN "latest_tx_sig_processed" varchar(88);--> statement-breakpoint
ALTER TABLE "v0_4_merges" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "v0_4_splits" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
CREATE VIEW "public"."prices_chart_data" AS (
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
  GROUP BY interv, prices.market_acct, prices_type
  );--> statement-breakpoint
CREATE VIEW "public"."proposal_total_trade_volume" AS (
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
  GROUP BY pass_market.proposal_acct, pass_market_acct, fail_market_acct
  );--> statement-breakpoint
CREATE VIEW "public"."twap_chart_data" AS (
  SELECT
      TIME_BUCKET('30 SECONDS'::INTERVAL, "twaps"."created_at") AS interv,
      last(token_amount, "twaps"."created_at") FILTER(WHERE "twaps"."created_at" IS NOT NULL AND "twaps"."created_at" <= "markets"."created_at" + '5 DAYS'::INTERVAL) AS token_amount,
      "twaps"."market_acct" AS market_acct
  FROM "twaps"
  JOIN "markets" ON "markets"."market_acct" = "twaps"."market_acct"
  WHERE "twaps"."created_at" <= "markets"."created_at" + '5 DAYS'::INTERVAL
  GROUP BY interv, "twaps"."market_acct"
  );