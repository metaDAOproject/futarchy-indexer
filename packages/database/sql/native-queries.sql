-- user_count_and_trade_count_per_proposal
-- WITH market_actors AS (
--     SELECT 
--       market_acct,
--       actor_acct,
--       COUNT(*) AS countOrders
--     FROM 
--       orders
--     GROUP BY 
--       market_acct, actor_acct
-- ), distinct_users_by_proposal AS (
--     SELECT
--         proposal_acct,
--         COUNT(DISTINCT actor_acct) AS uniqueUsersCount,
--         SUM(countOrders) AS totalTrades
--     FROM market_actors
--     JOIN markets ON markets.market_acct = market_actors.market_acct
--     GROUP BY proposal_acct
-- )
-- SELECT
-- 	proposal_acct,
-- 	uniqueUsersCount AS user_count,
-- 	totalTrades AS trade_count
-- FROM distinct_users_by_proposal
-- WHERE 
--     CASE 
--         WHEN {{proposal_acct}} IS NOT NULL 
--             THEN proposal_acct = {{proposal_acct}} 
--         ELSE 1 = 1 
--     END;

--top_dao_traders
-- select up.user_acct::TEXT, sum(up.total_volume)::BIGINT as "total_volume" from user_performance up
-- join proposals p on up.proposal_acct = p.proposal_acct 
-- join daos d on p.dao_acct = d.dao_acct
-- join dao_details dd on dd.dao_id = d.dao_id 
-- where dd.slug = {{dao_slug}}
-- group by dd.slug, up.user_acct
-- order by sum(up.total_volume) desc;