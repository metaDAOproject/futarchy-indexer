import {
  usingDb,
  schema,
  eq,
  notInArray,
  and,
  notIlike,
} from "@metadaoproject/indexer-db";
import {
  MarketRecord,
  MarketType,
  TokenRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import {
  ORCA_WHIRLPOOLS_CONFIG,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  WhirlpoolContext,
  buildWhirlpoolClient,
} from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";
import { connection, readonlyWallet } from "../../connection";
import { Err, Ok } from "../../match";
import {
  JupiterQuoteIndexingError,
  fetchQuoteFromJupe,
} from "../../indexers/jupiter/jupiter-quotes-indexer";

import Cron from "croner";

type IndexerAccountDependency =
  typeof schema.indexerAccountDependencies._.inferInsert;

export function startIndexerAccountDependencyPopulation() {
  const job = Cron("*/5 * * * *", () => {
    populateIndexerAccountDependencies();
  });
  console.log("populating indexers at ", job.nextRun());
}

async function populateIndexerAccountDependencies() {
  // populating market indexers
  try {
    await populateTokenMintIndexerAccountDependencies();
    await populateAmmMarketIndexerAccountDependencies();
    await populateOpenbookMarketIndexerAccountDependencies();
    await populateSpotPriceMarketIndexerAccountDependencies();
  } catch (e) {
    logger.error("error populating indexers", e);
  }
}
async function populateTokenMintIndexerAccountDependencies() {
  const mints: TokenRecord[] = await usingDb((db) =>
    db.select().from(schema.tokens).execute()
  );

  for (const mint of mints) {
    const newTokenMintIndexerDep: IndexerAccountDependency = {
      acct: mint.mintAcct,
      name: "token-mint-accounts",
      latestTxSigProcessed: null,
    };
    const insertRes = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values([newTokenMintIndexerDep])
        .onConflictDoNothing()
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );
    if (insertRes.length > 0) {
      console.log(
        "successfully populated indexer dependency for token mint account:",
        insertRes[0].acct
      );
    }
  }

  console.log("Successfully populated token mint indexers");
}

async function populateAmmMarketIndexerAccountDependencies() {
  const ammMarkets = await usingDb((db) =>
    db
      .select()
      .from(schema.markets)
      .where(and(eq(schema.markets.marketType, MarketType.FUTARCHY_AMM)))
      .execute()
  );

  for (const ammMarket of ammMarkets) {
    const newAmmIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.marketAcct.toString(),
      name: "amm-market-accounts",
      latestTxSigProcessed: null,
    };
    const newAmmIntervalIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.marketAcct.toString(),
      name: "amm-market-accounts-fetch",
      latestTxSigProcessed: null,
    };
    const newAmmLogsSubscribeIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.marketAcct.toString(),
      name: "amm-markets-logs-subscribe-indexer",
      latestTxSigProcessed: null,
    };

    const ammInsertResult = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values([
          newAmmIndexerDep,
          newAmmIntervalIndexerDep,
          newAmmLogsSubscribeIndexerDep,
        ])
        .onConflictDoNothing()
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );
    if (ammInsertResult.length > 0) {
      console.log(
        "successfully populated indexer dependency for amm market account:",
        ammInsertResult[0].acct
      );
    }
  }

  console.log(`Successfully populated AMM indexers`);
}

async function populateOpenbookMarketIndexerAccountDependencies() {
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
      logger.error(
        "error with inserting indexer dependency for openbook market:",
        openbookMarket.marketAcct
      );
    }
  }

  console.log("Successfully populated openbook market indexers");
}

enum PopulateSpotPriceMarketErrors {
  NotSupportedByJup = "NotSupportedByJup",
  GeneralJupError = "GeneralJupError",
}

async function populateSpotPriceMarketIndexerAccountDependencies() {
  const baseDaoTokens = await usingDb((db) =>
    db
      .select()
      .from(schema.tokens)
      .where(
        and(
          notIlike(schema.tokens.name, "%proposal%"),
          notInArray(schema.tokens.symbol, ["USDC", "mUSDC"])
        )
      )
      .execute()
  );

  // Loop through each token to find its corresponding USDC market address
  for (const token of baseDaoTokens) {
    const result = await populateJupQuoteIndexerAndMarket(token);
    // for ones that don't work on jup, do birdeye
    if (!result.success) {
      await populateBirdEyePricesIndexerAndMarket(token);
    }
    // Not enough coverage on orca for now so disabling
    // await populateOrcaWhirlpoolMarket(token);
  }
}

async function populateJupQuoteIndexerAndMarket(token: {
  symbol: string;
  name: string;
  imageUrl: string | null;
  mintAcct: string;
  supply: bigint;
  decimals: number;
  updatedAt: Date;
}) {
  const { mintAcct } = token;
  try {
    //check to see if jupiter can support this token
    const number = await fetchQuoteFromJupe(mintAcct);
    if (!number) {
      return Err({ type: JupiterQuoteIndexingError.JupiterFetchError });
    }

    // it is supported, so let's continue on
    const [usdcToken] = await usingDb((db) =>
      db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.symbol, "USDC"))
        .execute()
    );

    const baseTokenDependency: IndexerAccountDependency = {
      acct: mintAcct,
      name: "jupiter-quotes",
    };

    const insertRes = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values(baseTokenDependency)
        .onConflictDoNothing()
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );

    if (insertRes.length > 0) {
      console.log(
        "successfully inserted jupiter quote acct dep for tracking",
        insertRes[0].acct
      );
    }

    const jupMarket: MarketRecord = {
      marketAcct: mintAcct,
      baseLotSize: BigInt(0),
      baseMakerFee: 0,
      baseMintAcct: mintAcct,
      baseTakerFee: 0,
      marketType: MarketType.JUPITER_QUOTE,
      quoteMintAcct: usdcToken.mintAcct,
      quoteLotSize: BigInt(0),
      quoteTickSize: BigInt(0),
      quoteMakerFee: 0,
      quoteTakerFee: 0,
      createTxSig: "",
      activeSlot: null,
      inactiveSlot: null,
      createdAt: new Date(),
    };

    const marketInserRes = await usingDb((db) =>
      db
        .insert(schema.markets)
        .values(jupMarket)
        .onConflictDoNothing()
        .returning({ acct: schema.markets.marketAcct })
    );

    if (marketInserRes.length > 0) {
      console.log(
        "successfully inserted jupiter market, markets record for tracking",
        marketInserRes[0].acct
      );
    }
    return Ok(null);
  } catch (error) {
    logger.error(
      `Error populating jupiter quote indexer and market for USDC/${token.symbol}: ${error}`
    );
    return Err({ type: PopulateSpotPriceMarketErrors.GeneralJupError });
  }
}

async function populateBirdEyePricesIndexerAndMarket(token: {
  symbol: string;
  name: string;
  imageUrl: string | null;
  mintAcct: string;
  supply: bigint;
  decimals: number;
  updatedAt: Date;
}) {
  const { mintAcct } = token;
  try {
    const [usdcToken] = await usingDb((db) =>
      db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.symbol, "USDC"))
        .execute()
    );

    const baseTokenDependency: IndexerAccountDependency = {
      acct: mintAcct,
      name: "birdeye-prices",
    };

    const insertRes = await usingDb((db) =>
      db
        .insert(schema.indexerAccountDependencies)
        .values(baseTokenDependency)
        .onConflictDoNothing()
        .returning({ acct: schema.indexerAccountDependencies.acct })
    );

    if (insertRes.length > 0) {
      console.log(
        "successfully inserted birdeye prices acct dep for tracking",
        insertRes[0].acct
      );
    }

    const birdeyeMarket: MarketRecord = {
      marketAcct: mintAcct,
      baseLotSize: BigInt(0),
      baseMakerFee: 0,
      baseMintAcct: mintAcct,
      baseTakerFee: 0,
      marketType: MarketType.BIRDEYE_PRICES,
      quoteMintAcct: usdcToken.mintAcct,
      quoteLotSize: BigInt(0),
      quoteTickSize: BigInt(0),
      quoteMakerFee: 0,
      quoteTakerFee: 0,
      createTxSig: "",
      activeSlot: null,
      inactiveSlot: null,
      createdAt: new Date(),
    };

    const marketInserRes = await usingDb((db) =>
      db
        .insert(schema.markets)
        .values(birdeyeMarket)
        .onConflictDoNothing()
        .returning({ acct: schema.markets.marketAcct })
    );

    if (marketInserRes.length > 0) {
      console.log(
        "successfully inserted birdeye market, markets record for tracking",
        marketInserRes[0].acct
      );
    }
  } catch (error) {
    logger.error(
      `Error populating birdeye quote indexer and market for USDC/${token.symbol}: ${error}`
    );
  }

  console.log("successfully populate birdeye spot indexer for", token.symbol);
}

/**
 * NOT BEING USED FOR NOW. DOESN'T SUPPORT MANY PRICES WE NEED.
 * @param token
 */
async function populateOrcaWhirlpoolMarket(token: {
  symbol: string;
  name: string;
  imageUrl: string | null;
  mintAcct: string;
  supply: bigint;
  decimals: number;
  updatedAt: Date;
}) {
  try {
    const [usdcToken] = await usingDb((db) =>
      db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.symbol, "USDC"))
        .execute()
    );

    const pda = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG,
      new PublicKey(token.mintAcct),
      // new PublicKey(usdcToken[0].mintAcct),
      new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      128
    );

    const ctx = WhirlpoolContext.from(
      connection,
      readonlyWallet,
      ORCA_WHIRLPOOL_PROGRAM_ID
    );
    const client = buildWhirlpoolClient(ctx);
    const pool = await client.getPool(pda.publicKey);
    console.log("orca pool", pool);

    const orcaWhirlpoolMarket: MarketRecord = {
      asksTokenAcct: token.mintAcct,
      baseLotSize: BigInt(10 ** token.decimals),
      baseMakerFee: 0,
      baseMintAcct: token.mintAcct,
      baseTakerFee: 0,
      bidsTokenAcct: usdcToken.mintAcct,
      createTxSig: "",
      marketAcct: pool.getAddress().toString(),
      marketType: MarketType.ORCA_WHIRLPOOL,
      quoteLotSize: BigInt(10 ** usdcToken.decimals),
      quoteMakerFee: 0,
      quoteMintAcct: usdcToken.mintAcct,
      quoteTakerFee: 0,
      quoteTickSize: BigInt(0),
    };

    const insertRes = await usingDb((db) =>
      db
        .insert(schema.markets)
        .values(orcaWhirlpoolMarket)
        .onConflictDoNothing()
        .returning({ acct: schema.markets.marketAcct })
    );

    if (insertRes.length > 0) {
      console.log(
        "successfully inserted whirlpool market for tracking",
        insertRes[0].acct
      );
    }
  } catch (error) {
    logger.error(
      `Error fetching market address for USDC/${token.symbol}: ${error}`
    );
  }
}
