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

CREATE OR REPLACE VIEW public."proposal_prices_chart_data" AS
  WITH pass_market_bucket AS
  (
    SELECT proposal_acct,
          TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
          last(prices, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND prices.created_at <= proposals.ended_at) AS prices_row
    FROM proposals
    JOIN prices
    ON proposals.pass_market_acct = prices.market_acct
    WHERE prices.created_at IS NOT NULL AND prices.created_at <= proposals.ended_at
    GROUP BY proposal_acct, interv
  ),
  fail_market_bucket AS
  (
    SELECT proposal_acct,
          TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
          last(prices, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL AND prices.created_at <= proposals.ended_at) AS prices_row
    FROM proposals
    JOIN prices
    ON proposals.fail_market_acct = prices.market_acct
    WHERE prices.created_at IS NOT NULL AND prices.created_at <= proposals.ended_at
    GROUP BY proposal_acct, interv
  ),
  grouped AS
  (
    SELECT proposal_acct,
          interv,
          fmb.prices_row AS fmb_values,
          pmb.prices_row AS pmb_values
    FROM fail_market_bucket fmb
    FULL OUTER JOIN pass_market_bucket pmb
    USING (proposal_acct, interv)
  ),
  ffilled AS
  (
    SELECT proposal_acct,
          interv,
          (array_agg(fmb_values) FILTER (WHERE (fmb_values).price IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS fmb_value,
          (array_agg(pmb_values) FILTER (WHERE (pmb_values).price IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS pmb_value
    FROM grouped
  )
  SELECT proposal_acct,
        interv,
        (fmb_value).price AS fail_market_price,
        (fmb_value).base_amount AS fail_market_base_amount,
        (fmb_value).quote_amount AS fail_market_quote_amount,
        (fmb_value).prices_type AS fail_market_prices_type,
        (fmb_value).market_acct AS fail_market_acct,
        (pmb_value).price AS pass_market_price,
        (pmb_value).base_amount AS pass_market_base_amount,
        (pmb_value).quote_amount AS pass_market_quote_amount,
        (pmb_value).prices_type AS pass_market_prices_type,
        (pmb_value).market_acct AS pass_market_acct
  FROM ffilled
  WHERE (fmb_value).price IS NOT NULL AND (pmb_value).price IS NOT NULL
  ORDER BY proposal_acct, interv;

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
```
subscription {
  prices_chart_data(where: {market_acct:{_eq:"FmQ7v2QUqXVVtAXkngBh3Mwx7s3mKT55nQ5Z673dURYS") {
    price
    market_acct
    interv
  }
}
```



CREATE USER auth_client WITH password '';
GRANT CONNECT ON DATABASE railway TO auth_client;
GRANT SELECT, INSERT ON users TO auth_client;
GRANT SELECT, UPDATE, INSERT ON sessions TO auth_client;
GRANT SELECT, UPDATE, INSERT, DELETE ON reactions TO auth_client;
GRANT SELECT, UPDATE, INSERT ON comments TO auth_client;
GRANT SELECT, UPDATE, INSERT ON proposal_details TO auth_client;