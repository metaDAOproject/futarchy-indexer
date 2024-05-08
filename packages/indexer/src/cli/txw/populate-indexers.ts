import {
  usingDb,
  schema,
  eq,
  notInArray,
  and,
} from "@metadaoproject/indexer-db";
import { MarketType } from "@metadaoproject/indexer-db/lib/schema";

type IndexerAccountDependency =
  typeof schema.indexerAccountDependencies._.inferInsert;

export async function populateIndexers() {
  // populating market indexers
  await populateAmmMarketIndexers();
  await populateOpenbookMarketIndexers();
}
async function populateAmmMarketIndexers() {
  const ammIndexerQuery = await usingDb((db) =>
    db
      .select({ acct: schema.indexerAccountDependencies.acct })
      .from(schema.indexerAccountDependencies)
  );
  const ammMarkets = await usingDb((db) =>
    db
      .select()
      .from(schema.markets)
      .where(
        and(
          eq(schema.markets.marketType, MarketType.FUTARCHY_AMM),
          notInArray(
            schema.markets.marketAcct,
            ammIndexerQuery.map<string>((ai) => ai.acct)
          )
        )
      )
      .execute()
  );

  for (const ammMarket of ammMarkets) {
    const newAmmIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.marketAcct.toString(),
      name: "amm-market-accounts",
      latestTxSigProcessed: null,
    };

    const ammInsertResult = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values(newAmmIndexerDep)
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );
    if (ammInsertResult.length > 0) {
      console.log(
        "successfully populated indexer dependency for amm market account:",
        ammInsertResult[0].acct
      );
    } else {
      console.error(
        "error with inserting indexer dependency for amm market:",
        ammMarket.marketAcct
      );
    }
  }

  console.log(`Successfully populated AMM indexers`);
}

async function populateOpenbookMarketIndexers() {
  const indexerAccountsQuery = await usingDb((db) =>
    db
      .select({ acct: schema.indexerAccountDependencies.acct })
      .from(schema.indexerAccountDependencies)
  );
  const openbookMarkets = await usingDb((db) =>
    db
      .select()
      .from(schema.markets)
      .where(
        and(
          eq(schema.markets.marketType, MarketType.OPEN_BOOK_V2),
          notInArray(
            schema.markets.marketAcct,
            indexerAccountsQuery.map<string>((ai) => ai.acct)
          )
        )
      )
      .execute()
  );

  for (const openbookMarket of openbookMarkets) {
    const newopenbookIndexerDep: IndexerAccountDependency = {
      acct: openbookMarket.marketAcct.toString(),
      name: "openbook-market-accounts",
      latestTxSigProcessed: null,
    };

    const openbookInsertResult = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values(newopenbookIndexerDep)
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );
    if (openbookInsertResult.length > 0) {
      console.log(
        "successfully populated indexer dependency for openbook market account:",
        openbookInsertResult[0].acct
      );
    } else {
      console.error(
        "error with inserting indexer dependency for openbook market:",
        openbookMarket.marketAcct
      );
    }
  }

  console.log(`Successfully populated AMM indexers`);
}
