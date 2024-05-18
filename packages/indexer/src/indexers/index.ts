import { eq, schema, usingDb } from "@metadaoproject/indexer-db";
import { IndexerType } from "@metadaoproject/indexer-db/lib/schema";
import { startIntervalFetchIndexer } from "./start-interval-fetch-indexers";
import { startAccountInfoIndexer } from "./start-account-info-indexers";
import { startTransactionHistoryIndexer } from "./start-transaction-history-indexers";

export async function startIndexers() {
  await startMainIndexers();
  console.log("indexers successfully started");
}

export async function startMainIndexers() {
  const allIndexers = await usingDb((db) =>
    db
      .select()
      .from(schema.indexers)
      .fullJoin(
        schema.indexerAccountDependencies,
        eq(schema.indexerAccountDependencies.name, schema.indexers.name)
      )
      .execute()
  );

  const accountInfoIndexers = allIndexers.filter(
    (i) => i.indexers?.indexerType === IndexerType.AccountInfo
  );

  for (const indexerQueryRes of accountInfoIndexers) {
    await startAccountInfoIndexer(indexerQueryRes);
  }

  const intervalFetchIndexers = allIndexers.filter(
    (i) => i.indexers?.indexerType === IndexerType.IntervalFetch
  );

  for (const indexerQueryRes of intervalFetchIndexers) {
    if (indexerQueryRes.indexers?.implementation == "AutocratProposalIndexer") {
      startIntervalFetchIndexer(indexerQueryRes);

    }
  }

  const transactionHistoryIndexers = allIndexers.filter(
    (i) => i.indexers?.indexerType === IndexerType.TXHistory
  );

  for (const indexerQueryRes of transactionHistoryIndexers) {
    startTransactionHistoryIndexer(indexerQueryRes);
  }
}
