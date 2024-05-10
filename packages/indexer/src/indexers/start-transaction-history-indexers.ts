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
import {
  schema,
  usingDb,
  eq,
  and,
  gte,
  getClient,
} from "@metadaoproject/indexer-db";

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

    await listenToNewTxs(implementation, indexer);
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

async function listenToNewTxs(
  implementation: InstructionIndexer<Idl>,
  indexer: IndexerRecord
) {
  const client = await getClient();

  // Setting up the listener
  client.on("notification", async (msg) => {
    if (
      msg.payload === "notification" &&
      msg.channel === "new_transaction_channel"
    ) {
      const newTransaction = JSON.parse(msg.payload);
      console.log("New transaction received:", newTransaction);
      await indexExistingTxs([newTransaction], implementation, indexer);
    }
  });

  // Subscribe to the specific NOTIFY channel
  await client.query("LISTEN new_transaction_channel");

  // Here you might want to define what happens when the connection is closed or needs to be reestablished
  client.on("end", () => {
    console.log("Database connection ended");
    // Reconnect or handle disconnection appropriately
  });

  client.on("error", (err) => {
    console.error("Error in PostgreSQL listener", err);
    // Handle errors or reconnection here
  });
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
