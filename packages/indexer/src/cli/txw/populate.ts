import {
  usingDb,
  schema,
  eq,
  notInArray,
  and,
  notIlike,
} from "@metadaoproject/indexer-db";
import { MarketType } from "@metadaoproject/indexer-db/lib/schema";
import {
  ORCA_WHIRLPOOLS_CONFIG,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
} from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";

type IndexerAccountDependency =
  typeof schema.indexerAccountDependencies._.inferInsert;

export async function populateIndexers() {
  // populating market indexers
  try {
    await populateAmmMarketIndexers();
    await populateOpenbookMarketIndexers();
  } catch (e) {
    console.error("error populating indexers", e);
  }
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

async function populateSpotPriceMarkets() {
  const baseDaoTokens = await usingDb((db) =>
    db
      .select()
      .from(schema.tokens)
      .where(and(notIlike(schema.tokens.name, "%proposal%")))
      .execute()
  );

  // Loop through each token to find its corresponding USDC market address
  for (const token of baseDaoTokens) {
    const marketPair = `USDC/${token.symbol}`; // Construct the market pair string, assuming USDC is the base currency

    try {
      // Fetch the market address using the Orca SDK
      const usdcMint = new PublicKey("blahh");

      const pda = PDAUtil.getWhirlpool(
        ORCA_WHIRLPOOL_PROGRAM_ID,
        ORCA_WHIRLPOOLS_CONFIG,
        new PublicKey(token.mintAcct),
        usdcMint,
        2
      );
    } catch (error) {
      console.error(
        `Error fetching market address for ${marketPair}: ${error}`
      );
    }
  }
}
