import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../../connection";
import { IndexerWithAccountDeps } from "../types";
import { AccountLogsIndexer } from "../types/account-logs-indexer";
import { V3AmmLogsSubscribeIndexer } from "./amm/amm-market-logs-subscribe-indexer";
import { logger } from "../../logger";

export async function startLogsSubscribeIndexer(
  indexerQueryRes: IndexerWithAccountDeps
) {
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return;
  const implementation = getLogsSubscribeIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    const accountPubKey = new PublicKey(dependentAccount.acct);

    connection.onLogs(accountPubKey, async (logs, context) => {
      // wait here because we need to fetch the txn from RPC
      // and often we get no response if we try right after recieving the logs notification
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const res = await implementation.index(logs, accountPubKey, context);
      if (!res.success) {
        logger.error(
          "error indexing account logs",
          accountPubKey.toString(),
          res.error.type,
          JSON.stringify(res.error.value),
          "logs: " + logs.signature
        );
      }
    });
  }
}
function getLogsSubscribeIndexerImplementation(
  implementation: IndexerImplementation
): AccountLogsIndexer | null {
  switch (implementation) {
    case IndexerImplementation.V3AmmLogsSubscribeIndexer:
      return V3AmmLogsSubscribeIndexer;
  }
  return null;
}
