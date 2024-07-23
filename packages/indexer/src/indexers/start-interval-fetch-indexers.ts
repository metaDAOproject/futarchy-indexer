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
import { and, eq, schema, usingDb } from "@metadaoproject/indexer-db";
import { logger } from "../logger";

// add croner for this
// instantiates new croner and returns in function, which could be potentially useful
// now we can stop the job if we have an error

const maxResets = 5;

export function startIntervalFetchIndexer(
  indexerQueryRes: IndexerWithAccountDeps
): Cron | null {
  let errorCount = 0;
  let resets = 0;
  const { indexers: indexer, indexer_account_dependencies: dependentAccount } =
    indexerQueryRes;
  if (!indexer) return null;
  const implementation = getIntervalFetchIndexerImplementation(
    indexer.implementation
  );
  if (implementation && dependentAccount && dependentAccount.acct) {
    const retries = implementation.retries ?? 3; // default 3 interval fetch retries
    logger.log("setting interval fetch for:", dependentAccount.acct);
    const job = new Cron(
      implementation.cronExpression,
      {},
      async (self: Cron) => {
        const res = await implementation.index(dependentAccount.acct);
        if (!res.success) {
          logger.log(
            `error with interval fetch indexer ${dependentAccount.acct}:`,
            res.error
          );
          errorCount += 1;
          if (resets === maxResets) {
            // we have already paused/reset this indexer the max times, we are stopping the whole thing for good
            handleIntervalFetchFinalFailure(dependentAccount, self);
            return;
          }
          if (errorCount > retries) {
            handleIntervalFetchFailure(dependentAccount, self);
            // now that the job has been paused for 100 minutes, we reset the error count to 0
            errorCount = 0;
            resets += 1;
          }
        } else {
          errorCount = 0;
          logger.log(
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
  job: Cron
) {
  job.pause();
  const updateResult = await usingDb((db) =>
    db
      .update(schema.indexerAccountDependencies)
      .set({
        status: IndexerAccountDependencyStatus.Paused,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            schema.indexerAccountDependencies.acct,
            indexerWithAcct?.acct ?? ""
          ),
          eq(
            schema.indexerAccountDependencies.name,
            indexerWithAcct?.name ?? ""
          )
        )
      )
      .returning({ acct: schema.indexerAccountDependencies.acct })
  );
  if (updateResult.length !== 1) {
    logger.errorWithChatBotAlert(
      `error with pausing interval fetch indexer ${indexerWithAcct?.acct}.`
    );
  }
  // we resume job after 100 minutes to try again
  setTimeout(async () => {
    job.resume();
    const updateResult = await usingDb((db) =>
      db
        .update(schema.indexerAccountDependencies)
        .set({
          status: IndexerAccountDependencyStatus.Active,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              schema.indexerAccountDependencies.acct,
              indexerWithAcct?.acct ?? ""
            ),
            eq(
              schema.indexerAccountDependencies.name,
              indexerWithAcct?.name ?? ""
            )
          )
        )
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );
    if (updateResult.length !== 1) {
      logger.errorWithChatBotAlert(
        `failed to update indexer_account_dependency on acct ${indexerWithAcct?.acct} to Active even though the job has been resumed`
      );
    }
  }, 3600_000);
}

async function handleIntervalFetchFinalFailure(
  indexerWithAcct: IndexerWithAccountDeps["indexer_account_dependencies"],
  job: Cron
) {
  job.stop();
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
    logger.errorWithChatBotAlert(
      `final error with interval fetch indexer ${indexerWithAcct?.acct}. status set to disabled.`
    );
  }
}
