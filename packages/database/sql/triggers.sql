CREATE TRIGGER generate_conditional_markets_chart_data
  AFTER INSERT ON prices
  REFERENCING NEW TABLE AS generated
  FOR EACH ROW
  EXECUTE FUNCTION conditional_markets_chart_data_generate(
    prices.market_acct,
    prices.base_amount,
    prices.quote_amount,
    prices.price,
    prices.prices_type,
    prices.created_at,
  );

CREATE OR REPLACE FUNCTION conditional_markets_chart_data_generate(
  market_acct VARCHAR,
  base_amount BIGINT,
  quote_amount BIGINT,
  price NUMERIC,
  prices_type VARCHAR,
  created_at TIMESTAMP
) RETURNS integer
  LANGUAGE SQL
    CASE
      -- TODO: Do we want to check on our other table if we already have this market data inserted, or do we care
      -- and just handle conflict dynamically?
      WHEN prices_type = 'conditional'
        THEN
          -- TODO: We need to only insert the missing gap data, so going all the way back may be
          -- over doing it... Dunno what to do here.
          -- Create our conditional market table data
          -- proposal_conditional_price_data
            -- created_at
            -- proposal_acct
            -- pass_market_acct
            -- pass_market_price
            -- fail_market_acct
            -- fail_market_price
          -- NOTE: With this we first fetch data based on the market from the newly created table
          WITH conditional_price_data AS
          (
            SELECT
              proposal_acct,
              created_at,
              pass_market_acct,
              pass_market_price,
              fail_market_acct,
              fail_market_price
            FROM proposal_conditional_price_data
          ),
          conditional_price_data_summary AS
          (
            SELECT
              proposal_acct,
              pass_market_acct,
              fail_market_acct,
              MAX(created_at) AS last_time_for_price -- This will fetch us the last created_at
            FROM conditional_price_data
            GROUP BY proposal_acct, pass_market_acct, fail_market_acct -- Our grouping so we can aggregate
          ),
          pass_market_bucket AS
          (
            SELECT
              proposals.proposal_acct,
              TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
              LAST(prices, prices.created_at) FILTER(
                WHERE prices.created_at IS NOT NULL
                AND prices.created_at <= proposals.ended_at -- TODO: This is a poor filter given our indexing
              ) AS prices_row
            FROM proposals
            JOIN prices
              ON proposals.pass_market_acct = prices.market_acct
            LEFT JOIN conditional_price_data_summary
              ON conditional_price_data_summary.pass_market_acct = prices.market_acct
            WHERE 
              prices.created_at IS NOT NULL
              AND prices.created_at <= proposals.ended_at -- TODO: This is a poor filter given our indexing
              AND 
              CASE
                WHEN conditional_price_data_summary.last_time_for_price IS NOT NULL
                  THEN prices.created_at > conditional_price_data_summary.last_time_for_price
                ELSE TRUE
              END -- A check to see if we have any data yet, otherwise we know we need to fill all the data in
            GROUP BY proposals.proposal_acct, interv
          ),
          fail_market_bucket AS
          (
            SELECT
              proposals.proposal_acct,
              TIME_BUCKET('30 SECONDS'::INTERVAL, prices.created_at) AS interv,
              LAST(prices, prices.created_at) FILTER(
                WHERE prices.created_at IS NOT NULL
                AND prices.created_at <= proposals.ended_at -- TODO: This is a poor filter given our indexing
              ) AS prices_row
            FROM proposals
            JOIN prices
              ON proposals.fail_market_acct = prices.market_acct
            LEFT JOIN conditional_price_data_summary
              ON conditional_price_data_summary.fail_market_acct = prices.market_acct
            WHERE
              prices.created_at IS NOT NULL
              AND prices.created_at <= proposals.ended_at -- TODO: This is a poor filter given our indexing
              AND 
              CASE
                WHEN conditional_price_data_summary.last_time_for_price IS NOT NULL
                  THEN prices.created_at > conditional_price_data_summary.last_time_for_price
                ELSE TRUE
              END -- A check to see if we have any data yet, otherwise we know we need to fill all the data in
            GROUP BY proposals.proposal_acct, interv
          ),
          grouped AS
          (
            SELECT
              proposal_acct,
              interv,
              fmb.prices_row AS fmb_values,
              pmb.prices_row AS pmb_values
            FROM fail_market_bucket fmb
            FULL OUTER JOIN pass_market_bucket pmb
            USING (proposal_acct, interv)
          ),
          ffilled AS
          (
            SELECT
              proposal_acct,
              interv,
              (array_agg(fmb_values) FILTER (WHERE (fmb_values).price IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS fmb_value,
              (array_agg(pmb_values) FILTER (WHERE (pmb_values).price IS NOT NULL) OVER (PARTITION BY proposal_acct ORDER BY interv DESC ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING))[1] AS pmb_value
            FROM grouped
          )
          SELECT
            proposal_acct,
            interv::TIMESTAMPTZ AS created_at,
            (pmb_value).market_acct AS pass_market_acct,
            (pmb_value).price AS pass_market_price,
            (fmb_value).price AS fail_market_price,
            (fmb_value).market_acct AS fail_market_acct
          FROM ffilled
          WHERE (fmb_value).price IS NOT NULL AND (pmb_value).price IS NOT NULL
          ORDER BY proposal_acct, interv;
          -- Create our conditional liquidity table data
          -- proposal_conditional_liquidity_data
            -- created_at
            -- proposal_acct
            -- pass_market_acct
            -- pass_market_base_amount
            -- pass_market_quote_amount
            -- fail_market_acct
            -- fail_market_base_amount
            -- fail_market_base_amount
            -- fail_market_quote_amount
      WHEN prices_type = 'spot'
        THEN
          -- Create our spot price table data
          -- spot_price_data
            -- created_at
            -- spot_price
            -- mint_acct
      ELSE NULL;