import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";

import { IndexerWithAccountDeps } from "../types";
import { BirdeyePricesIndexer } from "./birdeye/birdeye-prices-indexer";
import { IntervalFetchIndexer } from "./interval-fetch-indexer";
import { JupiterQuotesIndexer } from "./jupiter/jupiter-quotes-indexer";
import { AmmMarketAccountIntervalFetchIndexer } from "./amm-market/amm-market-account-interval-indexer";

export function startIntervalFetchIndexer(
  indexerQueryRes: IndexerWithAccountDeps
) {
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return;
  const implementation = getIntervalFetchIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    console.log("setting interval fetch for:", dependentAccount.acct);
    setInterval(async () => {
      const res = await implementation.index(dependentAccount.acct);
      if (!res.success) {
        console.log(
          `error with interval fetch indexer ${dependentAccount.acct}:`,
          res.error
        );
      }
    }, implementation.intervalMs);
  }
}
export function getIntervalFetchIndexerImplementation(
  implementation: IndexerImplementation
): IntervalFetchIndexer | null {
  switch (implementation) {
    case IndexerImplementation.JupiterQuotesIndexer:
      return JupiterQuotesIndexer;
    case IndexerImplementation.BirdeyePricesIndexer:
      return BirdeyePricesIndexer;
    case IndexerImplementation.AmmMarketsAccountFetch:
      return AmmMarketAccountIntervalFetchIndexer;
  }
  return null;
}
