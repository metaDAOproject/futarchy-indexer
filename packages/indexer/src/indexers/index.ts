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

export async function startIndexers() {
  await startAccountInfoIndexers();
  console.log("indexers successfully started");
}

export async function startAccountInfoIndexers() {
  const accountInfoIndexers = await usingDb((db) =>
    db
      .select()
      .from(schema.indexers)
      .where(eq(schema.indexers.indexerType, IndexerType.AccountInfo))
      .fullJoin(
        schema.indexerAccountDependencies,
        eq(schema.indexerAccountDependencies.name, schema.indexers.name)
      )
      .execute()
  );

  for (const indexerQueryRes of accountInfoIndexers) {
    startAccountInfoIndexer(indexerQueryRes);
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
  const implementation = getIndexerImplementation(indexer.implementation);
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
          "error indexing account update",
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

function getIndexerImplementation(
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
