# Futarchy Indexer

This project aims to index order data from each of The Meta DAO's proposals into candlestick data. 
This way we can show charts on how the proposals do over time in the UI.

The indexer is made of 3 components:
- the indexer service which contacts an RPC periodically to poll for any orders on not yet concluded proposals; the indexer will consolidate the order data into candles then store these in a database
- a postgres database
- a hasura instance which exposes a real-time GraphQL read-only API over the postgres data

Since this is just a generic means to cache on-chain data into Postgres then expose a real-time GraphQL API over this data, it could be used for more than just candlestick indexing, but we'll begin with that use-case.

## How it works

Historical data on Solana [is not available from your standard Solana RPC](https://dexterlab.com/improving-solana-historical-data-accessibility/#current-state-of-solana-archival-data). Geyser [was created in order to achieve lossless real-time data streaming](https://github.com/solana-labs/solana/issues/18197) into a db, however it only can give you the current account states an RPC has stored plus any future state, allowing you to construct an accurate account history from the moment you enable the Geyser plugin but not an account history from prior transactions. Not to mention [this costs $2k per month from Triton](https://triton.one/triton-rpc/#pricing-section) and [$1.1k per month from Helius](https://docs.helius.dev/high-performance-infra/dedicated-infrastructure/dedicated-geyser-nodes). There are likely better ways to spend The Meta DAO's treasury, plus one of the selling points of an indexer in the first place is its potential to save on rather than balloon RPC costs. There is an ongoing collab between Triton, Firedancer, and Protocol Labs devs to store all historical data on IPFS (project [Old Faithful](https://github.com/rpcpool/yellowstone-faithful)) but this is still a work in progress and __just storing the index__ used to lookup accounts on IPFS is already [50 terabytes](https://youtu.be/oVhif85sv_I?si=aFFG41yu9XpvYqlQ&t=2138)! 

Is there a simpler, cost effective way to get historical data?

The approach futarchy-indexer takes is to replay the transaction history to recreate each historical account state.
Historical transactions are not pruned as aggressively as account state (where only the latest account state is kept) so this works with standard solana RPCs without needing to upgrade to more expensive infra tiers. The downside of this approach is a lot more complexity since we have to actually parse each historical transaction and know how the Solana program executing that transaction would have translated this into a mutation on any account states. If that translation is very complex, this approach can be difficult to maintain. Thankfully, the states and transactions we're concerned about here: token balances, [twap markets](https://github.com/metaDAOproject/openbook-twap/blob/82690c33a091b82e908843a14ad1a571dfba12b1/programs/openbook-twap/src/lib.rs#L29-L53), [proposal metadata](https://github.com/metaDAOproject/futarchy/blob/593ae6ad449f9110b10087eb0ceebc86020ee3be/programs/autocrat_v0/src/lib.rs#L42-L85), orderbooks and swaps, aren't too complex.

Futarchy Indexer operates on 2 core entities: 
1. transaction watchers
1. indexers

A transaction watcher takes an account, then subscribes real time to all signatures for that account. It's job is to ensure it both 
- stores real time transactions for an account using [RPC webhook APIs](https://docs.helius.dev/webhooks-and-websockets/websockets#subscription-endpoints) 
- has not skipped storing any transaction metadata, utilizing the [`getSignaturesForAddress`](https://solana.com/docs/rpc/http/getsignaturesforaddress) API.

An indexer depends on one or more transaction watchers. Once it sees all its dependencies have backed up transactions to a certain slot, it can process all these transactions up to that slot, parsing instruction data and updating corresponding tables representing proposals, twaps, order books and trading history.

Why do we want multiple indexers?
- This allows no-downtime upgrades to the indexing and transaction caching logic. 
  - If a bug is identified in prior indexer logic, we simply create a new indexer starting at slot 0 which will overwrite existing data until it catches up with the existing indexer, at which point we can remove the duplicate indexer.
  - If a bug is identified in the transaction caching logic, we update the logic then set the transaction watcher's slot back to 0, and start a new indexer at 0 which will overrite existing data using the corrected transactions.
- As we upgrade the Meta DAO we'll need to watch different sets of accounts. For example autocrat V0 and V0.1 have different programs and DAO accounts and should be represented by different watchers. Once we switch from OpenBook to an in-house AMM, we'll also need a new watcher. Multiple wathcers / indexers in parallel means we can index data for proposals based on old and new accounts in parallel, and not lose the ability to index historical proposal data even as the DAO is upgraded

## Secrets
- `FUTARCHY_HELIUS_API_KEY` used by indexer
- `FUTARCHY_PG_URL` used by indexer

## Contributing

After cloning run `pnpm install` in the project directory

Docs on each top-level script below

### `migrate` script

Migrate db to match definition in `packages/database/lib/schema.ts`. Assumes you have set the `FUTARCHY_PG_URL` env var.  
Also regenerates the graphql client (TODO).

### `sql` script

Run raw sql against the database. Assumes you have set the `FUTARCHY_PG_URL` env var.

![](./docs/assets/pnpm-sql.png)

You can add to the `COMMON_STATEMENTS` const in `packages/database/src/run-sql.ts` if you have a long sql query you want to save for later reuse.

### `update-hasura` script

TODO

### `start-service` script

Starts the service

### `publish-client` script

TODO
