New Indexer Architecture


Transaction Indexer

Indexes all transactions across all programs v3 and v4. Populates transactions table where the signature is the pk and transaction_accounts, 
which links each signature to an account_id (program)

Split into 2 parts - frontfiller and backfiller

Frontfiller - checks for new transactions every second, and when a new txn is detected, first inserts into transactions table, 
then asynchronously triggers processTransaction() if there is no conflict in the insert (which implies the txn has already been processed) to 
process the transaction and populate other tables as necessary. This way, we process transactions as soon as they are detected, minimizing latency
as compared to having seperate workers that track the transactions table and process transactions (such as fetchEligibleSignatures in v4 indexer).

Backfiller - the purpose of this is a failsafe in case a transaction fails to be picked up by the RPC or indexer. 
Runs every 15 mins and fetches all signatures within the last 15 mins and adds to transactions table.
If the txn doesn't already exist in the transaction table, we process the transaction as it hasn't been indexed.

On startup, the transaction indexer fetches all historical txns from the creation of the programs



processTransaction(txn, version)

if version is v4, we check the events emitted in the transaction and call handleAmmEvent() and/or handleVaultEvent() accordingly to populate the 
appropriate tables

if version is v3, we take the transaction response and call indexTransactin() in instruction-dispatch.ts to index the txn and populate the 
appropriate tables
