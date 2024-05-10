import {
  IndexerImplementation,
  IndexerRecord,
  TransactionRecord,
  TransactionWatcherTransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";

import { IndexerWithAccountDeps } from "../types";
import { AmmMarketInstructionsIndexer } from "./amm-market/amm-market-instruction-indexer";
import { InstructionIndexer } from "./instruction-indexer";
import { Idl } from "@coral-xyz/anchor";
import { schema, usingDb, eq, and, gte } from "@metadaoproject/indexer-db";
import * as fastq from "fastq";
import type { queueAsPromised } from "fastq";

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
          and(
            eq(
              schema.transactionWatcherTransactions.watcherAcct,
              dependentAccount.acct
            ),
            gte(schema.transactions.slot, indexer.latestSlotProcessed)
          )
        )
        .execute();
    });

    await indexExistingTxs(transactions, implementation, indexer);
  }
}

async function indexExistingTxs(
  transactions: {
    transactions: TransactionRecord | null;
    transaction_watcher_transactions: TransactionWatcherTransactionRecord | null;
  }[],
  implementation: InstructionIndexer<Idl>,
  indexer: IndexerRecord
) {
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

export const newTxQueue: queueAsPromised<{
  transactions: TransactionRecord | null;
  transaction_watcher_transactions: TransactionWatcherTransactionRecord | null;
}> = fastq.promise(handleNewTxs, 1);

async function handleNewTxs(msg: {
  transactions: TransactionRecord | null;
  transaction_watcher_transactions: TransactionWatcherTransactionRecord | null;
}) {
  const { transactions: tx, transaction_watcher_transactions: watcherTx } = msg;
  // query for the any indexer account dependencies based on the watcher acct, and then query for the indexer implementation based on that, then you are up and running
  const indexerQueryRes = await usingDb((db) => {
    return db
      .select()
      .from(schema.indexerAccountDependencies)
      .fullJoin(
        schema.indexers,
        eq(schema.indexers.name, schema.indexerAccountDependencies.name)
      )
      .where(
        eq(schema.indexerAccountDependencies.acct, watcherTx?.watcherAcct ?? "")
      )
      .execute();
  });
  if (indexerQueryRes.length === 0) {
    console.log(
      "skipping processing new tx, no indexer query result. Tx Sig:",
      tx?.txSig
    );
    return;
  }
  const { indexers: indexer } = indexerQueryRes[0];
  if (!indexer) {
    console.log(
      "skipping processing new tx, no indexer tied to query result. Tx Sig:",
      tx?.txSig
    );
    return;
  }
  const implementation = getTransactionHistoryImplementation(
    indexer.implementation
  );
  if (!implementation) {
    console.log(
      "skipping processing new tx, no implementation found. Tx Sig:",
      tx?.txSig
    );
    return;
  }
  indexExistingTxs([msg], implementation, indexer);
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
