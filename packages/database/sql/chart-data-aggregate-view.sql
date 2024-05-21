CREATE OR REPLACE VIEW public."twap_chart_data" AS
  SELECT
      TIME_BUCKET('10 SECONDS'::INTERVAL, created_at) AS interv,
      last(token_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS token_amount,
      market_acct
  FROM twaps
  GROUP BY interv, market_acct;

CREATE OR REPLACE VIEW public."prices_chart_data" AS 
  SELECT
      TIME_BUCKET('10 SECONDS'::INTERVAL, created_at) AS interv,
      last(price, created_at) FILTER(WHERE created_at IS NOT NULL) AS price,
      last(base_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS base_amount,
      last(quote_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS quote_amount,
      prices_type,
      market_acct
  FROM prices
  GROUP BY interv, market_acct, prices_type;


CREATE OR REPLACE VIEW public."proposal_prices_chart_data" AS
  WITH proposal_markets AS
  (
    SELECT proposal_acct,
          pass_market_acct,
          fail_market_acct
    FROM proposals
  ),
  pass_market_bucket AS
  (
    SELECT proposal_acct,
          TIME_BUCKET('10 SECONDS'::INTERVAL, prices.created_at) AS interv,
          last(price, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS price,
          last(base_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS base_amount,
          last(quote_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS quote_amount,
          prices_type,
          market_acct
    FROM proposals
    JOIN prices
    ON proposals.pass_market_acct = prices.market_acct
    GROUP BY proposal_acct, interv, prices_type, market_acct
  ),
  fail_market_bucket AS
  (
    SELECT proposal_acct,
          TIME_BUCKET('10 SECONDS'::INTERVAL, prices.created_at) AS interv,
          last(price, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS price,
          last(base_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS base_amount,
          last(quote_amount, prices.created_at) FILTER(WHERE prices.created_at IS NOT NULL) AS quote_amount,
          prices_type,
          market_acct
    FROM proposals
    JOIN prices
    ON proposals.fail_market_acct = prices.market_acct
    GROUP BY proposal_acct, interv, prices_type, market_acct
  ),
  grouped AS
  (
    SELECT proposal_acct,
          interv,
          CASE WHEN fmb.price IS NULL THEN NULL ELSE ROW(fmb.price, fmb.base_amount, fmb.quote_amount, fmb.prices_type, fmb.market_acct)::price_ffil_record END AS fmb_values,
          CASE WHEN pmb.price IS NULL THEN NULL ELSE ROW(pmb.price, pmb.base_amount, pmb.quote_amount, pmb.prices_type, pmb.market_acct)::price_ffil_record END AS pmb_values
    FROM fail_market_bucket fmb
    FULL OUTER JOIN pass_market_bucket pmb
    USING (proposal_acct, interv)
  ),
  ffilled AS
  (
    SELECT proposal_acct,
          interv,
          (array_agg(fmb_values) FILTER (WHERE fmb_values IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS fmb_value,
          (array_agg(pmb_values) FILTER (WHERE pmb_values IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS pmb_value
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

```
subscription {
  prices_chart_data(where: {market_acct:{_eq:"FmQ7v2QUqXVVtAXkngBh3Mwx7s3mKT55nQ5Z673dURYS") {
    price
    market_acct
    interv
  }
}
```