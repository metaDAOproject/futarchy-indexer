import {
  IndexerAccountDependencyStatus,
  IndexerImplementation,
} from "@metadaoproject/indexer-db/lib/schema";

import { IndexerWithAccountDeps } from "../types";
import { BirdeyePricesIndexer } from "./birdeye/birdeye-prices-indexer";
import { IntervalFetchIndexer } from "./interval-fetch-indexer";
import { JupiterQuotesIndexer } from "./jupiter/jupiter-quotes-indexer";
import { AmmMarketAccountIntervalFetchIndexer } from "./amm-market/amm-market-account-interval-indexer";
import { AutocratDaoIndexer } from "./autocrat/autocrat-dao-indexer";
import { AutocratProposalIndexer } from "./autocrat/autocrat-proposal-indexer";
import { TokenMintIndexer } from "./token/token-mint-indexer";
import { Cron } from "croner";
import { eq, schema, usingDb } from "@metadaoproject/indexer-db";
import { logger } from "../logger";

// add croner for this
// instantiates new croner and returns in function, which could be potentially useful
// now we can stop the job if we have an error

export function startIntervalFetchIndexer(
  indexerQueryRes: IndexerWithAccountDeps
): Cron | null {
  let errorCount = 0;
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return null;
  const implementation = getIntervalFetchIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    const retries = implementation.retries ?? 3; // default 3 interval fetch retries
    console.log("setting interval fetch for:", dependentAccount.acct);
    const job = new Cron(
      implementation.cronExpression,
      {},
      async (self: Cron) => {
        const res = await implementation.index(dependentAccount.acct);
        if (!res.success) {
          console.log(
            `error with interval fetch indexer ${dependentAccount.acct}:`,
            res.error
          );
          errorCount += 1;
          if (errorCount > retries) {
            handleIntervalFetchFailure(dependentAccount, self);
          }
        } else {
          errorCount = 0;
          console.log(
            `next run for ${dependentAccount.acct} with ${
              indexer.implementation
            } at ${self.nextRun()}`
          );
        }
      }
    );
    return job;
  }
  return null;
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
    case IndexerImplementation.AutocratDaoIndexer:
      return AutocratDaoIndexer;
    case IndexerImplementation.AutocratProposalIndexer:
      return AutocratProposalIndexer;
    case IndexerImplementation.TokenMintIndexer:
      return TokenMintIndexer;
  }
  return null;
}

async function handleIntervalFetchFailure(
  indexerWithAcct: IndexerWithAccountDeps["indexer_account_dependencies"],
  croner: Cron
) {
  croner.stop();
  const updateResult = await usingDb((db) =>
    db
      .update(schema.indexerAccountDependencies)
      .set({
        status: IndexerAccountDependencyStatus.Disabled,
        updatedAt: new Date(),
      })
      .where(
        eq(schema.indexerAccountDependencies.acct, indexerWithAcct?.acct ?? "")
      )
      .returning({ acct: schema.indexerAccountDependencies.acct })
  );
  if (updateResult.length !== 1) {
    logger.error(
      `final error with interval fetch indexer ${indexerWithAcct?.acct}. status set to disabled.`
    );
  }
}
