CREATE TRIGGER generate_conditional_markets_chart_data
  AFTER INSERT ON prices
  REFERENCING NEW TABLE AS generated
  FOR EACH ROW
  -- TODO: Do we care about passing these values in???
  EXECUTE FUNCTION conditional_markets_chart_data_generate(
    NEW.prices.market_acct,
    NEW.prices.base_amount,
    NEW.prices.quote_amount,
    NEW.prices.price,
    NEW.prices.prices_type,
    NEW.prices.created_at,
  );

CREATE TRIGGER after_insert_prices
AFTER INSERT ON prices
REFERENCING NEW TABLE AS new_data
FOR EACH STATEMENT
EXECUTE FUNCTION conditional_markets_chart_data_generate();

-- TODO: Do I care about passing these values in???
CREATE OR REPLACE FUNCTION conditional_markets_chart_data_generate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM new_data LOOP
    CASE
      -- TODO: Do we want to check on our other table if we already have this market data inserted, or do we care
      -- and just handle conflict dynamically?
      WHEN rec.prices_type = 'conditional'
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
          ),
          inserted_price_data AS (
            INSERT INTO proposal_conditional_price_data (
              created_at,
              proposal_acct,
              pass_market_acct,
              pass_market_price,
              fail_market_acct,
              fail_market_price
            )
            SELECT
              interv::TIMESTAMPTZ AS created_at,
              proposal_acct,
              (pmb_value).market_acct AS pass_market_acct,
              (pmb_value).price AS pass_market_price,
              (fmb_value).market_acct AS fail_market_acct,
              (fmb_value).price AS fail_market_price
            FROM ffilled
            WHERE (fmb_value).price IS NOT NULL AND (pmb_value).price IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM proposal_conditional_price_data
              WHERE
                created_at = interv::TIMESTAMPTZ
                AND proposal_acct = proposal_acct
                AND pass_market_acct = (pmb_value).market_acct
                AND pass_market_price = (pmb_value).price
                AND fail_market_acct = (fmb_value).market_acct
                AND fail_market_price = (fmb_value).price
            )
            RETURNING created_at, proposal_acct, pass_market_acct, fail_market_acct
          )
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
          INSERT INTO proposal_conditional_liquidity_data (
            created_at,
            proposal_acct,
            pass_market_acct,
            pass_market_base_amount,
            pass_market_quote_amount,
            fail_market_acct,
            fail_market_base_amount,
            fail_market_quote_amount
          )
          SELECT
            interv::TIMESTAMPTZ AS created_at,
            proposal_acct,
            (pmb_value).market_acct AS pass_market_acct,
            (pmb_value).base_amount AS pass_market_base_amount,
            (pmb_value).quote_amount AS pass_market_quote_amount,
            (fmb_value).market_acct AS fail_market_acct,
            (fmb_value).base_amount AS fail_market_base_amount,
            (fmb_value).quote_amount AS fail_market_quote_amount
          FROM ffilled
          WHERE (fmb_value).fail_market_base_amount IS NOT NULL AND (pmb_value).fail_market_base_amount IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM proposal_conditional_liquidity_data
            WHERE
              created_at = interv::TIMESTAMPTZ
              AND proposal_acct = proposal_acct
              AND pass_market_acct = (pmb_value).market_acct
              AND pass_market_base_amount = (pmb_value).base_amount
              AND pass_market_quote_amount = (pmb_value).quote_amount
              AND fail_market_acct = (fmb_value).market_acct
              AND fail_market_base_amount = (fmb_value).base_amount
              AND fail_market_quote_amount = (fmb_value).quote_amount
          )
      WHEN rec.prices_type = 'spot'
        THEN
          TRUE
          -- Create our spot price table data
          -- spot_price_data
            -- created_at
            -- spot_price
            -- mint_acct
      ELSE NULL
    END CASE;
  END LOOP;
  RETURN NULL;
END;
$$;