import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../connection";
import { IndexerWithAccountDeps } from "../types";
import { AccountLogsIndexer } from "./account-logs-indexer";
import { AmmMarketLogsSubscribeIndexer } from "./amm-market/amm-market-logs-subscribe-indexer";

export async function startAccountInfoIndexer(
  indexerQueryRes: IndexerWithAccountDeps
) {
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return;
  const implementation = getAccountInfoIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    const accountPubKey = new PublicKey(dependentAccount.acct);

    connection.onLogs(accountPubKey, async (logs, context) => {
      const res = await implementation.index(logs, accountPubKey, context);
      if (!res.success) {
        console.error("error indexing account logs", accountPubKey.toString());
      }
    });
  }
}
function getAccountInfoIndexerImplementation(
  implementation: IndexerImplementation
): AccountLogsIndexer | null {
  switch (implementation) {
    case IndexerImplementation.AmmMarketsLogsSubscribe:
      return AmmMarketLogsSubscribeIndexer;
  }
  return null;
}
