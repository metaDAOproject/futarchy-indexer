import { eq, schema, usingDb } from "@metadaoproject/indexer-db";
import {
  IndexerImplementation,
  IndexerType,
} from "@metadaoproject/indexer-db/lib/schema";
import { AccountInfoIndexer } from "./account-info-indexer";
import { AmmMarketAccountUpdateIndexer } from "./amm-market/amm-market-account-indexer";
import { connection } from "../connection";
import { PublicKey } from "@solana/web3.js";
import { OpenbookV2MarketAccountUpdateIndexer } from "./openbook-v2/openbook-v2-account-indexer";
import { JupiterQuotesIndexer } from "./jupiter/jupiter-quotes-indexer";
import { IntervalFetchIndexer } from "./interval-fetch-indexer";
import { BirdeyePricesIndexer } from "./birdeye/birdeye-prices-indexer";

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
    startIntervalFetchIndexer(indexerQueryRes);
  }
}

type IndexerWithAccountDeps = {
  indexers: {
    name: string;
    implementation: IndexerImplementation;
    latestSlotProcessed: bigint;
    indexerType: IndexerType;
  } | null;
  indexer_account_dependencies: {
    name: string;
    acct: string;
    latestTxSigProcessed: string | null;
  } | null;
};

async function startAccountInfoIndexer(
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

    const accountInfo = await connection.getAccountInfoAndContext(
      accountPubKey
    );

    //index refresh on startup
    if (accountInfo.value) {
      const res = await implementation.index(
        accountInfo.value,
        accountPubKey,
        accountInfo.context
      );
      if (!res.success) {
        console.error(
          "error indexing account initial fetch",
          accountPubKey.toString()
        );
      }
    }

    connection.onAccountChange(accountPubKey, async (accountInfo, context) => {
      const res = await implementation.index(
        accountInfo,
        accountPubKey,
        context
      );
      if (!res.success) {
        console.error(
          "error indexing account update",
          accountPubKey.toString()
        );
      }
    });
  }
}

function startIntervalFetchIndexer(indexerQueryRes: IndexerWithAccountDeps) {
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

function getAccountInfoIndexerImplementation(
  implementation: IndexerImplementation
): AccountInfoIndexer | null {
  switch (implementation) {
    case IndexerImplementation.AmmMarketIndexer:
      return AmmMarketAccountUpdateIndexer;
    case IndexerImplementation.OpenbookV2MarketIndexer:
      return OpenbookV2MarketAccountUpdateIndexer;
  }
  return null;
}
function getIntervalFetchIndexerImplementation(
  implementation: IndexerImplementation
): IntervalFetchIndexer | null {
  switch (implementation) {
    case IndexerImplementation.JupiterQuotesIndexer:
      return JupiterQuotesIndexer;
    case IndexerImplementation.BirdeyePricesIndexer:
      return BirdeyePricesIndexer;
  }
  return null;
}
