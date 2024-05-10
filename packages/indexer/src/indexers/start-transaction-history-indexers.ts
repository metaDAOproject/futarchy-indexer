import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";

import { IndexerWithAccountDeps } from "../types";
import { AmmMarketInstructionsIndexer } from "./amm-market/amm-market-instruction-indexer";
import { InstructionIndexer } from "./instruction-indexer";
import { Idl } from "@coral-xyz/anchor";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";

// it is stored as base58 but the

export async function startTransactionHistoryIndexer(
  indexerQueryRes: IndexerWithAccountDeps
) {
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return;
  const implementation = getTransactionHistoryImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    // query for all transactions for this acct with slots higher than this indexer
    const transactions = await usingDb((db) => {
      return db
        .select()
        .from(schema.transactions)
        .fullJoin(
          schema.transactionWatcherTransactions,
          eq(
            schema.transactionWatcherTransactions.txSig,
            schema.transactions.txSig
          )
        )
        .where(
          eq(
            schema.transactionWatcherTransactions.watcherAcct,
            dependentAccount.acct
          )
        )
        .execute();
    });

    for (const tx of transactions) {
      if (tx.transactions?.txSig) {
        const res = await implementation.indexTransactionSig(tx.transactions);
        if (res.success) {
          // update latest slot for indexer
          const updateResult = await usingDb((db) =>
            db
              .update(schema.indexers)
              .set({
                latestSlotProcessed: tx.transactions?.slot,
              })
              .where(eq(schema.indexers.name, indexer.name))
              .returning({
                latestSlotProcessed: schema.indexers.latestSlotProcessed,
              })
          );
          if (updateResult.length > 0) {
            console.log(
              `successfully updated indexer "${indexer.name}" to slot ${updateResult[0].latestSlotProcessed}`
            );
          }
        }
      }
    }
  }
}

export function getTransactionHistoryImplementation(
  implementation: IndexerImplementation
): InstructionIndexer<Idl> | null {
  switch (implementation) {
    case IndexerImplementation.AmmMarketInstructionsIndexer:
      return AmmMarketInstructionsIndexer;
  }
  return null;
}
