# Futarchy Indexer

This project aims to index order data from each of The Meta DAO's proposals into candlestick data. 
This way we can show charts on how the proposals do over time in the UI.

The indexer is made of 3 components:
- the indexer service which contacts an RPC periodically to poll for any orders on not yet concluded proposals; the indexer will consolidate the order data into candles then store these in a database
- a postgres database
- a hasura instance which exposes a real-time GraphQL read-only API over the postgres data
