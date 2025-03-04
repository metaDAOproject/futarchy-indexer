import {
  usingDb,
  schema,
  eq,
  and,
  isNotNull,
  or
} from "@metadaoproject/indexer-db";
import {
  MarketRecord,
  MarketType,
  TokenRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { Err, Ok } from "../../utils/match";
import {
  JupiterQuoteIndexingError,
  fetchQuoteFromJupe,
} from "../../indexers/jupiter/jupiter-quotes-indexer";

import Cron from "croner";
import { logger } from "../../../logger";

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
    // await populateAmmMarketIndexerAccountDependencies();
    await populateSpotPriceMarketIndexerAccountDependencies();
  } catch (e) {
    logger.error("error populating indexers", e);
  }
}
async function populateTokenMintIndexerAccountDependencies() {
  console.log("populating token mint indexers, fetching base dao tokens");
  const mints: TokenRecord[] =
    (await usingDb((db) =>
        db.select({
          symbol: schema.tokens.symbol,
          name: schema.tokens.name,
          updatedAt: schema.tokens.updatedAt,
          mintAcct: schema.tokens.mintAcct,
          supply: schema.tokens.supply,
          decimals: schema.tokens.decimals,
          imageUrl: schema.tokens.imageUrl
        })
        .from(schema.tokens)
        .innerJoin(schema.daos, eq(schema.tokens.mintAcct, schema.daos.baseAcct))
        .execute())) ?? [];
  console.log(`found ${mints.length} base dao tokens`);

  for (const mint of mints) {
    const newTokenMintIndexerDep: IndexerAccountDependency = {
      acct: mint.mintAcct,
      name: "token-mint-accounts",
      latestTxSigProcessed: null,
    };
    const insertRes =
      (await usingDb((db) =>
        db
          .insert(schema.indexerAccountDependencies)
          .values([newTokenMintIndexerDep])
          .onConflictDoNothing()
          .returning({ acct: schema.indexerAccountDependencies.acct })
      )) ?? [];
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
  //we only want to index the markets that have a proposal or a metric decision
  const ammMarkets =
    (await usingDb((db) =>
      db
        .select()
        .from(schema.markets)
        .leftJoin(schema.v0_4_metric_decisions, eq(schema.markets.marketAcct, schema.v0_4_metric_decisions.ammAddr))
        .where(and(
          eq(schema.markets.marketType, MarketType.FUTARCHY_AMM),
          or(
            isNotNull(schema.markets.proposalAcct),
            isNotNull(schema.v0_4_metric_decisions.id)
          )
        ))
        .execute()
    )) ?? [];

  for (const ammMarket of ammMarkets) {
    // TODO: we no longer need an account info indexer on market accounts.. leaving this here for now
    // const newAmmIndexerDep: IndexerAccountDependency = {
    //   acct: ammMarket.marketAcct.toString(),
    //   name: "amm-market-accounts",
    //   latestTxSigProcessed: null,
    // };
    const newAmmIntervalIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.markets.marketAcct.toString(),
      name: "amm-market-accounts-fetch",
      latestTxSigProcessed: null,
    };
    const newAmmLogsSubscribeIndexerDep: IndexerAccountDependency = {
      acct: ammMarket.markets.marketAcct.toString(),
      name: "amm-markets-logs-subscribe-indexer",
      latestTxSigProcessed: null,
    };

    const ammInsertResult =
      (await usingDb((db) =>
        db
          .insert(schema.indexerAccountDependencies)
          .values([
            // newAmmIndexerDep, //TODO: leaving this here for now
            newAmmIntervalIndexerDep,
            newAmmLogsSubscribeIndexerDep,
          ])
          .onConflictDoNothing()
          .returning({ acct: schema.indexerAccountDependencies.acct })
      )) ?? [];
    if (ammInsertResult.length > 0) {
      console.log(
        "successfully populated indexer dependency for amm market account:",
        ammInsertResult[0].acct
      );
    }
  }

  console.log(`Successfully populated AMM indexers`);
}



enum PopulateSpotPriceMarketErrors {
  NotSupportedByJup = "NotSupportedByJup",
  GeneralJupError = "GeneralJupError",
}

async function populateSpotPriceMarketIndexerAccountDependencies() {
  console.log("populating spot price market indexers, fetching base dao tokens");
  const baseDaoTokens =
    (await usingDb((db) =>
      db
        .select({
          symbol: schema.tokens.symbol,
          name: schema.tokens.name,
          updatedAt: schema.tokens.updatedAt,
          mintAcct: schema.tokens.mintAcct,
          supply: schema.tokens.supply,
          decimals: schema.tokens.decimals,
          imageUrl: schema.tokens.imageUrl
        })
        .from(schema.tokens)
        .innerJoin(schema.daos, eq(schema.tokens.mintAcct, schema.daos.baseAcct))
        .execute()
    )) ?? [];
  console.log(`found ${baseDaoTokens.length} base dao tokens`);
  // Loop through each token to find its corresponding USDC market address
  for (const token of baseDaoTokens) {
    const result = await populateJupQuoteIndexerAndMarket({
      ...token,
      supply: BigInt(token.supply)
    });
    // for ones that don't work on jup, do birdeye
    if (!result.success) {
      await populateBirdEyePricesIndexerAndMarket({
        ...token,
        supply: BigInt(token.supply)
      });
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
    const [usdcToken] =
      (await usingDb((db) =>
        db
          .select()
          .from(schema.tokens)
          .where(eq(schema.tokens.symbol, "USDC"))
          .execute()
      )) ?? [];
    if (!usdcToken)
      return Err({
        type: JupiterQuoteIndexingError.GeneralJupiterQuoteIndexError,
      });

    const baseTokenDependency: IndexerAccountDependency = {
      acct: mintAcct,
      name: "jupiter-quotes",
    };

    const insertRes =
      (await usingDb((db) =>
        db
          .insert(schema.indexerAccountDependencies)
          .values(baseTokenDependency)
          .onConflictDoNothing()
          .returning({ acct: schema.indexerAccountDependencies.acct })
      )) ?? [];

    if (insertRes.length > 0) {
      console.log(
        "successfully inserted jupiter quote acct dep for tracking",
        insertRes[0].acct
      );
    }

    const jupMarket: MarketRecord = {
      marketAcct: mintAcct,
      baseLotSize: "0",
      baseMakerFee: 0,
      baseMintAcct: mintAcct,
      baseTakerFee: 0,
      marketType: MarketType.JUPITER_QUOTE,
      quoteMintAcct: usdcToken.mintAcct,
      quoteLotSize: "0",
      quoteTickSize: "0",
      quoteMakerFee: 0,
      quoteTakerFee: 0,
      createTxSig: "",
      activeSlot: null,
      inactiveSlot: null,
      createdAt: new Date(),
    };

    const marketInserRes =
      (await usingDb((db) =>
        db
          .insert(schema.markets)
          .values(jupMarket)
          .onConflictDoNothing()
          .returning({ acct: schema.markets.marketAcct })
      )) ?? [];

    if (marketInserRes.length > 0) {
      console.log(
        "successfully inserted jupiter market, markets record for tracking",
        marketInserRes[0].acct
      );
    }
    return Ok(null);
  } catch (error) {
    logger.warn(
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
    const [usdcToken] =
      (await usingDb((db) =>
        db
          .select()
          .from(schema.tokens)
          .where(eq(schema.tokens.symbol, "USDC"))
          .execute()
      )) ?? [];

    if (!usdcToken) return;

    const baseTokenDependency: IndexerAccountDependency = {
      acct: mintAcct,
      name: "birdeye-prices",
    };

    const insertRes =
      (await usingDb((db) =>
        db
          .insert(schema.indexerAccountDependencies)
          .values(baseTokenDependency)
          .onConflictDoNothing()
          .returning({ acct: schema.indexerAccountDependencies.acct })
      )) ?? [];

    if (insertRes.length > 0) {
      console.log(
        "successfully inserted birdeye prices acct dep for tracking",
        insertRes[0].acct
      );
    }

    const birdeyeMarket: MarketRecord = {
      marketAcct: mintAcct,
      baseLotSize: "0",
      baseMakerFee: 0,
      baseMintAcct: mintAcct,
      baseTakerFee: 0,
      marketType: MarketType.BIRDEYE_PRICES,
      quoteMintAcct: usdcToken.mintAcct,
      quoteLotSize: "0",
      quoteTickSize: "0",
      quoteMakerFee: 0,
      quoteTakerFee: 0,
      createTxSig: "",
      activeSlot: null,
      inactiveSlot: null,
      createdAt: new Date(),
    };

    const marketInserRes =
      (await usingDb((db) =>
        db
          .insert(schema.markets)
          .values(birdeyeMarket)
          .onConflictDoNothing()
          .returning({ acct: schema.markets.marketAcct })
      )) ?? [];

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
// async function populateOrcaWhirlpoolMarket(token: {
//   symbol: string;
//   name: string;
//   imageUrl: string | null;
//   mintAcct: string;
//   supply: bigint;
//   decimals: number;
//   updatedAt: Date;
// }) {
//   try {
//     const [usdcToken] = await usingDb((db) =>
//       db
//         .select()
//         .from(schema.tokens)
//         .where(eq(schema.tokens.symbol, "USDC"))
//         .execute()
//     );

//     const pda = PDAUtil.getWhirlpool(
//       ORCA_WHIRLPOOL_PROGRAM_ID,
//       ORCA_WHIRLPOOLS_CONFIG,
//       new PublicKey(token.mintAcct),
//       // new PublicKey(usdcToken[0].mintAcct),
//       new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
//       128
//     );

//     const ctx = WhirlpoolContext.from(
//       connection,
//       readonlyWallet,
//       ORCA_WHIRLPOOL_PROGRAM_ID
//     );
//     const client = buildWhirlpoolClient(ctx);
//     const pool = await client.getPool(pda.publicKey);
//     console.log("orca pool", pool);

//     const orcaWhirlpoolMarket: MarketRecord = {
//       asksTokenAcct: token.mintAcct,
//       baseLotSize: BigInt(10 ** token.decimals),
//       baseMakerFee: 0,
//       baseMintAcct: token.mintAcct,
//       baseTakerFee: 0,
//       bidsTokenAcct: usdcToken.mintAcct,
//       createTxSig: "",
//       marketAcct: pool.getAddress().toString(),
//       marketType: MarketType.ORCA_WHIRLPOOL,
//       quoteLotSize: BigInt(10 ** usdcToken.decimals),
//       quoteMakerFee: 0,
//       quoteMintAcct: usdcToken.mintAcct,
//       quoteTakerFee: 0,
//       quoteTickSize: BigInt(0),
//     };

//     const insertRes = await usingDb((db) =>
//       db
//         .insert(schema.markets)
//         .values(orcaWhirlpoolMarket)
//         .onConflictDoNothing()
//         .returning({ acct: schema.markets.marketAcct })
//     );

//     if (insertRes.length > 0) {
//       console.log(
//         "successfully inserted whirlpool market for tracking",
//         insertRes[0].acct
//       );
//     }
//   } catch (error) {
//     logger.error(
//       `Error fetching market address for USDC/${token.symbol}: ${error}`
//     );
//   }
// }
