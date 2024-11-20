New Indexer Architecture

Indexers

Logs Subscribe Indexer - subscribes to new txns on a given program, when a txn is received, we index it

Account Info Update Indexer - subscribes to account info updates on programs, such as amms to update reserves

Fetch Interval Indexer - polls getSignaturesForAddress on an interval, populating/indexing txs in case
its missed by Logs Subscribe Indexer.

History Indexer - gets full tx history for a program (or at least as much as the RPC can provide).
runs on startup and on long intervals


processTransaction(txn, programId)

if the programId is V4, we process the events emitted in the txn.
if v3, we use the swapBuilder to decode the transaction and check token balance changes to 
figure out if the txn is a buy or sell
