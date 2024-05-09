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

type IndexerAccountDependency =
  typeof schema.indexerAccountDependencies._.inferInsert;

export async function populateIndexers() {
  // populating market indexers
  try {
    await populateAmmMarketIndexers();
    await populateOpenbookMarketIndexers();
    await populateSpotPriceMarkets();
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
    await populateJupQuoteIndexer(token);
    // Not enough coverage on orca for now so disabling
    // await populateOrcaWhirlpoolMarket(token);
  }
}

async function populateJupQuoteIndexer(token: {
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
    const baseTokenDependency: IndexerAccountDependency = {
      acct: mintAcct,
      name: "jupiter-quote-fetch",
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
        "successfully inserted whirlpool market for tracking",
        insertRes[0].acct
      );
    }
  } catch (error) {
    console.error(
      `Error fetching market address for USDC/${token.symbol}: ${error}`
    );
  }
}

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
    console.error(
      `Error fetching market address for USDC/${token.symbol}: ${error}`
    );
  }
}
