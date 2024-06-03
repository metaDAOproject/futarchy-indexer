CREATE OR REPLACE FUNCTION get_proposal_bars(_proposal_acct VARCHAR, _bar_size INTERVAL, _start_time TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (bar_start_time    TIMESTAMPTZ,
               proposal_acct     VARCHAR,
               pass_market_acct  VARCHAR,
               pass_price        NUMERIC,
               pass_base_amount  BIGINT,
               pass_quote_amount BIGINT,
               fail_market_acct  VARCHAR,
               fail_price        NUMERIC,
               fail_base_amount  BIGINT,
               fail_quote_amount BIGINT)
LANGUAGE SQL
AS
$$
WITH proposal AS (
	SELECT
        pass_market_acct,
        fail_market_acct,
        created_at,
        ended_at
	FROM proposals
	WHERE proposal_acct = _proposal_acct
), series AS (
	SELECT
		time_series_generated
	FROM
		GENERATE_SERIES(
			TIME_BUCKET(_bar_size, (SELECT created_at FROM proposal)),
			TIME_BUCKET(_bar_size, (SELECT ended_at FROM proposal)),
			_bar_size
		) AS time_series_generated
), matching_pass_data AS (
	SELECT
		TIME_BUCKET(_bar_size, created_at) AS created_at,
		LAST(prices.price, price) AS price,
		LAST(prices.base_amount, base_amount) AS base_amount,
		LAST(prices.quote_amount, quote_amount) AS quote_amount
	FROM
		prices
	WHERE prices.market_acct = (SELECT pass_market_acct FROM proposal)
		AND prices.created_at <= (SELECT ended_at FROM proposal)
	GROUP BY created_at
), matching_fail_data AS (
	SELECT
		TIME_BUCKET(_bar_size, created_at) AS created_at,
		LAST(prices.price, price) AS price,
		LAST(prices.base_amount, base_amount) AS base_amount,
		LAST(prices.quote_amount, quote_amount) AS quote_amount
	FROM
		prices
	WHERE prices.market_acct = (SELECT fail_market_acct FROM proposal)
		AND prices.created_at <= (SELECT ended_at FROM proposal)
	GROUP BY created_at
), aggregate_pass_data_with_series AS (
	SELECT
		time_series_generated AS created_at,
		price,
		base_amount,
		quote_amount
	FROM series
	LEFT JOIN matching_pass_data ON time_series_generated = created_at
), aggregate_fail_data_with_series AS (
	SELECT
		time_series_generated AS created_at,
		price,
		base_amount,
		quote_amount
	FROM series
	LEFT JOIN matching_fail_data ON time_series_generated = created_at
), forward_fill_pass AS (
	SELECT
		DISTINCT created_at AS created_at,
		MIN(price) OVER (PARTITION BY sequence_value) AS price,
		MIN(base_amount) OVER (PARTITION BY sequence_value) AS base_amount,
		MIN(quote_amount) OVER (PARTITION BY sequence_value) AS quote_amount
    FROM
	(SELECT 
			created_at,
			price,
			base_amount,
			quote_amount,
			COUNT(price) OVER (ORDER BY created_at) AS sequence_value
		FROM aggregate_pass_data_with_series
	) AS aggregate_pass_data_with_series
), forward_fill_fail AS (
	SELECT
		DISTINCT created_at AS created_at,
		MIN(price) OVER (PARTITION BY sequence_value) AS price,
		MIN(base_amount) OVER (PARTITION BY sequence_value) AS base_amount,
		MIN(quote_amount) OVER (PARTITION BY sequence_value) AS quote_amount
    FROM
	(SELECT 
			created_at,
			price,
			base_amount,
			quote_amount,
			COUNT(price) OVER (ORDER BY created_at) AS sequence_value
		FROM aggregate_fail_data_with_series
	) AS aggregate_fail_data_with_series
)
SELECT
	forward_fill_pass.created_at AS created_at,
	_proposal_acct AS proposal_acct,
	(SELECT pass_market_acct FROM proposal) AS pass_market_acct,
	(forward_fill_pass.price) AS pass_price,
	(forward_fill_pass.base_amount) AS pass_base_amount,
	(forward_fill_pass.quote_amount) AS pass_quote_amount,
	(SELECT fail_market_acct FROM proposal) AS fail_market_acct,
	forward_fill_fail.price AS fail_price,
	forward_fill_fail.base_amount AS fail_base_amount,
	forward_fill_fail.quote_amount AS fail_quote_amount
FROM forward_fill_pass
JOIN forward_fill_fail ON forward_fill_pass.created_at = forward_fill_fail.created_at
ORDER BY created_at DESC;
$$;


CREATE TABLE proposal_bars
(
  proposal_acct     VARCHAR,
  bar_size          INTERVAL,
  bar_start_time    TIMESTAMPTZ,
  pass_market_acct  VARCHAR,
  pass_price        NUMERIC,
  pass_base_amount  BIGINT,
  pass_quote_amount BIGINT,
  fail_market_acct  VARCHAR,
  fail_price        NUMERIC,
  fail_base_amount  BIGINT,
  fail_quote_amount BIGINT,
  PRIMARY KEY (proposal_acct, bar_size, bar_start_time)   
);

CREATE OR REPLACE FUNCTION refresh_all_proposal_bars()
RETURNS VOID
LANGUAGE PLPGSQL 
AS
$$
DECLARE
  _proposal_acct VARCHAR;
BEGIN  
  FOR _proposal_acct IN
    SELECT proposal_acct FROM proposals
  LOOP
    WITH bars AS (
        SELECT DISTINCT ON (proposal_acct, bar_start_time) * FROM get_proposal_bars(_proposal_acct, INTERVAL '30 seconds')
    )
    INSERT INTO proposal_bars (
        proposal_acct, bar_size, bar_start_time, 
        pass_market_acct, pass_price, pass_base_amount, pass_quote_amount, 
        fail_market_acct, fail_price, fail_base_amount, fail_quote_amount
    )
    SELECT 
        proposal_acct, INTERVAL '30 seconds', bar_start_time, 
        pass_market_acct, pass_price, pass_base_amount, pass_quote_amount, 
        fail_market_acct, fail_price, fail_base_amount, fail_quote_amount
    FROM bars
    ON CONFLICT (proposal_acct, bar_size, bar_start_time)
    DO UPDATE SET 
        pass_market_acct = EXCLUDED.pass_market_acct,
        pass_price = EXCLUDED.pass_price,
        pass_base_amount = EXCLUDED.pass_base_amount,
        pass_quote_amount = EXCLUDED.pass_quote_amount,
        fail_market_acct = EXCLUDED.fail_market_acct,
        fail_price = EXCLUDED.fail_price,
        fail_base_amount = EXCLUDED.fail_base_amount,
        fail_quote_amount = EXCLUDED.fail_quote_amount;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_all_proposal_bars_action(job_id INT DEFAULT NULL, config JSONB DEFAULT NULL)
RETURNS VOID
LANGUAGE SQL
AS
$$
  SELECT refresh_all_proposal_bars();
$$;

SELECT add_job('refresh_all_proposal_bars_action', '15s');