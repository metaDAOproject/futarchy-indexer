CREATE OR REPLACE VIEW public."twap_chart_data" AS
  SELECT
      TIME_BUCKET('1 MIN'::INTERVAL, created_at) AS interv,
      last(token_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS token_amount,
      market_acct
  FROM twaps
  GROUP BY interv, market_acct;

CREATE OR REPLACE VIEW public."prices_chart_data" AS 
  SELECT
      TIME_BUCKET('1 MIN'::INTERVAL, created_at) AS interv,
      last(price, created_at) FILTER(WHERE created_at IS NOT NULL) AS price,
      last(base_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS base_amount,
      last(quote_amount, created_at) FILTER(WHERE created_at IS NOT NULL) AS quote_amount,
      prices_type,
      market_acct
  FROM prices
  GROUP BY interv, market_acct, prices_type;

```
subscription {
  prices_chart_data(where: {market_acct:{_eq:"FmQ7v2QUqXVVtAXkngBh3Mwx7s3mKT55nQ5Z673dURYS") {
    price
    market_acct
    interv
  }
}
```