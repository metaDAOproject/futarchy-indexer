import { eq, getClient, schema, usingDb } from "@metadaoproject/indexer-db";
import {
  IndexerAccountDependencyReadRecord,
  IndexerAccountDependencyStatus,
  IndexerType,
} from "@metadaoproject/indexer-db/lib/schema";
import { startIntervalFetchIndexer } from "./start-interval-fetch-indexers";
import { startAccountInfoIndexer } from "./start-account-info-indexers";
import { startTransactionHistoryIndexer } from "./start-transaction-history-indexers";
import { startLogsSubscribeIndexer } from "./start-logs-subscribe-indexer";
import { IndexerWithAccountDeps } from "../types";
import { logger } from "../../logger";

export async function startIndexers() {
  await startAllIndexers();
  await listenForNewAccountsToIndex();
  console.log("indexers successfully started");
}

export async function startAllIndexers() {
  const allIndexers =
    (await usingDb((db) =>
      db
        .select()
        .from(schema.indexers)
        .fullJoin(
          schema.indexerAccountDependencies,
          eq(schema.indexerAccountDependencies.name, schema.indexers.name)
        )
        .where(
          eq(
            schema.indexerAccountDependencies.status,
            IndexerAccountDependencyStatus.Active
          )
        )
        .execute()
    )) ?? [];

  for (const indexerQueryRes of allIndexers) {
    await startIndexer(indexerQueryRes);
  }
}

async function startIndexer(indexerQueryRes: any) {
  switch (indexerQueryRes.indexers?.indexerType) {
    case IndexerType.AccountInfo:
      await startAccountInfoIndexer(indexerQueryRes);
      break;
    case IndexerType.IntervalFetch:
      const job = await startIntervalFetchIndexer(indexerQueryRes);
      if (job) {
        console.log(
          `scheduled to run account ${
            indexerQueryRes?.indexer_account_dependencies?.acct
          } on the ${indexerQueryRes.indexers?.implementation} indexer at ${job
            .nextRun()
            ?.toISOString()} and on a pattern of ${job.getPattern()}`
        );
      }
      break;
    case IndexerType.TXHistory:
      startTransactionHistoryIndexer(indexerQueryRes);
      break;
    case IndexerType.LogSubscribe:
      startLogsSubscribeIndexer(indexerQueryRes);
      break;
    default:
      console.warn(
        `Unknown indexer type: ${indexerQueryRes.indexers?.indexerType}`
      );
  }
}

async function listenForNewAccountsToIndex() {
  const client = await getClient();
  client.query("LISTEN indexer_account_dependencies_insert_channel");

  client.on("notification", async (msg) => {
    const payload = JSON.parse(msg.payload ?? "{}");
    await handleNewAccountToIndex(payload);
  });
}

async function handleNewAccountToIndex(
  newRow: IndexerAccountDependencyReadRecord
) {
  // Example function to handle the new row
  try {
    // skip disabled acct
    if (newRow.status === IndexerAccountDependencyStatus.Disabled) return;

    const indexer =
      (await usingDb((db) =>
        db
          .select()
          .from(schema.indexers)
          .where(eq(schema.indexers.name, newRow.name))
          .execute()
      )) ?? [];
    if (!indexer[0]) {
      console.warn(
        "new indexer dependency inserted that does not tie to an indexer"
      );
      return;
    }
    const indexerWithAccountDep: IndexerWithAccountDeps = {
      indexer_account_dependencies: newRow,
      indexers: indexer[0],
    };
    await startIndexer(indexerWithAccountDep);
    // Perform operations using Drizzle ORM
    // For example, you could log the new row or trigger other indexers
  } catch (e) {
    logger.errorWithChatBotAlert(
      "error with starting of indexing new account dependency",
      e
    );
  }
}
