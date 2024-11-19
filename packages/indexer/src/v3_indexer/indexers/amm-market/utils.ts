import { BN } from "@coral-xyz/anchor";
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { PriceMath } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq, inArray } from "@metadaoproject/indexer-db";
import { TokenRecord } from "@metadaoproject/indexer-db/lib/schema";
import { PricesType } from "@metadaoproject/indexer-db/lib/schema";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { provider, rpcReadClient } from "../../connection";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { logger } from "../../../logger";
import { getHumanPrice } from "../../usecases/math";
import { getMint } from "@solana/spl-token";
import { connection } from "../../../connection";

export enum AmmMarketAccountIndexingErrors {
  AmmTwapIndexError = "AmmTwapIndexError",
  MarketMissingError = "MarketMissingError",
  AmmV4TwapIndexError = "AmmV4TwapIndexError",
  AmmTwapPriceError = "AmmTwapPriceError",
  AmmTwapNoInsertError = "AmmTwapNoInsertError",
}

export async function indexAmmMarketAccountWithContext(
  accountInfo: AccountInfo<Buffer>,
  account: PublicKey,
  context: Context
): Promise<Result<string, TaggedUnion>> {
  const ammMarketAccount = await rpcReadClient.markets.amm.decodeMarket(
    accountInfo
  );

  // TODO: prob need to type these lol
  let baseToken;
  let quoteToken;

  //get base and quote decimals from db
  console.log("utils::indexAmmMarketAccountWithContext::getting tokens from db", ammMarketAccount.baseMint.toString(), ammMarketAccount.quoteMint.toString());
  const tokens = await usingDb((db) =>
    db
      .select()
      .from(schema.tokens)
      .where(inArray(schema.tokens.mintAcct, [ammMarketAccount.baseMint.toString(), ammMarketAccount.quoteMint.toString()]))
      .execute()
  );

  if (!tokens || tokens.length < 2) {
    // fallback if we don't have the tokens in the db for some reason
    console.log("utils::indexAmmMarketAccountWithContext::no tokens in db, fetching from rpc");
    baseToken = await enrichTokenMetadata(
      ammMarketAccount.baseMint,
      provider
    );
    quoteToken = await enrichTokenMetadata(
      ammMarketAccount.quoteMint,
      provider
    )

    // get token mints from rpc (needed for fetching supply)
    const baseMintPubKey = new PublicKey(baseToken.publicKey ?? "");
    const baseTokenMint = await getMint(
      connection,
      baseMintPubKey
    );
    const quoteMintPubKey = new PublicKey(quoteToken.publicKey ?? "");
    const quoteTokenMint = await getMint(
      connection,
      quoteMintPubKey
    );
    const baseTokenRecord: TokenRecord = {
      symbol: baseToken.symbol,
      name: baseToken.name ? baseToken.name : baseToken.symbol,
      decimals: baseToken.decimals,
      mintAcct: baseToken.publicKey ?? "",
      supply: baseTokenMint.supply.toString(),
      updatedAt: new Date(),
    }
    const quoteTokenRecord: TokenRecord = {
      symbol: quoteToken.symbol,
      name: quoteToken.name ? quoteToken.name : quoteToken.symbol,
      decimals: quoteToken.decimals,
      mintAcct: quoteToken.publicKey ?? "",
      supply: quoteTokenMint.supply.toString(),
      updatedAt: new Date(),
    }
    const tokensToInsert = [baseTokenRecord, quoteTokenRecord];
    //upsert tokens to db
    await usingDb((db) =>
      db
        .insert(schema.tokens)
        .values(tokensToInsert)
        .onConflictDoNothing() //TODO: probably better to update instead of do nothing on conflict, since supply/name/ticker could've changed
        .execute()
    );
  } else {
    [baseToken, quoteToken] = tokens;
  }
  
  // if we don't have an oracle.aggregator of 0 let's run this mf
  if (!ammMarketAccount.oracle.aggregator.isZero()) {
    // indexing the twap
    const market = await usingDb((db) =>
      db
        .select()
        .from(schema.markets)
        .where(eq(schema.markets.marketAcct, account.toBase58()))
        .execute()
    );
    if (market === undefined || market.length === 0) {
      return Err({ type: AmmMarketAccountIndexingErrors.MarketMissingError });
    }

    const twapCalculation: BN = ammMarketAccount.oracle.aggregator.div(
      ammMarketAccount.oracle.lastUpdatedSlot.sub(
        ammMarketAccount.createdAtSlot
      )
    );

    const proposalAcct = market[0].proposalAcct;

    // if (proposalAcct === null) {
    //   logger.error("failed to index amm twap for v4 amm", account.toBase58());
    //   return Err({ type: AmmMarketAccountIndexingErrors.AmmV4TwapIndexError });
    // }
    const twapNumber: string = twapCalculation.toString();
    const newTwap: TwapRecord = {
      curTwap: twapNumber,
      marketAcct: account.toBase58(),
      observationAgg: ammMarketAccount.oracle.aggregator.toString(),
      proposalAcct: proposalAcct,
      // alternatively, we could pass in the context of the update here
      updatedSlot: context
        ? context.slot.toString()
        : ammMarketAccount.oracle.lastUpdatedSlot.toString(),
      lastObservation: ammMarketAccount.oracle.lastObservation.toString(),
      lastPrice: ammMarketAccount.oracle.lastPrice.toString(),
    };

    try{
    // TODO batch commits across inserts - maybe with event queue
      console.log("utils::indexAmmMarketAccountWithContext::upserting twap", newTwap);
      const twapUpsertResult = await usingDb((db) =>
        db
          .insert(schema.twaps)
          .values(newTwap)
          .onConflictDoNothing()
          .returning({ marketAcct: schema.twaps.marketAcct })
      );

      if (twapUpsertResult === undefined || twapUpsertResult.length === 0) {
        logger.error("failed to upsert twap", newTwap);
        // return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapNoInsertError });
      }
    } catch (e) {
      logger.error("failed to upsert twap", e);
      return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapNoInsertError });
    }
  }

  let priceFromReserves: BN;

  if (ammMarketAccount.baseAmount.isZero() || ammMarketAccount.quoteAmount.isZero()) {
    logger.error("NO RESERVES", ammMarketAccount);
    logger.error("baseAmount", ammMarketAccount.baseAmount.toString());
    logger.error("quoteAmount", ammMarketAccount.quoteAmount.toString());
    return Ok("no price from reserves");
  }

  try {
    priceFromReserves = PriceMath.getAmmPriceFromReserves(
      ammMarketAccount.baseAmount,
      ammMarketAccount.quoteAmount
    );
  } catch (e) {
    logger.error("failed to get price from reserves", e);
    return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapPriceError });
  }

  let conditionalMarketSpotPrice: number;
  try {
    conditionalMarketSpotPrice = getHumanPrice(
      priceFromReserves,
      baseToken.decimals!!,
      quoteToken.decimals!!
    );
  } catch (e) {
    logger.error("failed to get human price", e);
    return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapPriceError });
  }

  const newAmmConditionaPrice: PricesRecord = {
    marketAcct: account.toBase58(),
    updatedSlot: context
      ? context.slot.toString()
      : ammMarketAccount.oracle.lastUpdatedSlot.toString(),
    price: conditionalMarketSpotPrice.toString(),
    pricesType: PricesType.Conditional,
    createdBy: "amm-market-indexer",
    baseAmount: ammMarketAccount.baseAmount.toString(),
    quoteAmount: ammMarketAccount.quoteAmount.toString(),
  };

  const pricesInsertResult = await usingDb((db) =>
    db
      .insert(schema.prices)
      .values(newAmmConditionaPrice)
      .onConflictDoUpdate({
        target: [schema.prices.createdAt, schema.prices.marketAcct],
        set: newAmmConditionaPrice,
      })
      .returning({ marketAcct: schema.prices.marketAcct })
  );
  if (pricesInsertResult === undefined || pricesInsertResult.length === 0) {
    logger.error("failed to index amm price", newAmmConditionaPrice.marketAcct);
    return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapPriceError  });
  }

  return Ok(`successfully indexed amm: ${account.toBase58()}`);
}
