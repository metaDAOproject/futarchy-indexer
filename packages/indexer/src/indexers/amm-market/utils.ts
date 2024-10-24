import { BN } from "@coral-xyz/anchor";
import { BN_0, enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { PriceMath } from "@metadaoproject/futarchy/v0.4";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { PricesType } from "@metadaoproject/indexer-db/lib/schema";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { provider, rpcReadClient } from "../../connection";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { logger } from "../../logger";
import { getHumanPrice } from "../../usecases/math";

export enum AmmMarketAccountIndexingErrors {
  AmmTwapIndexError = "AmmTwapIndexError",
  MarketMissingError = "MarketMissingError",
  AmmV4TwapIndexError = "AmmV4TwapIndexError",
  AmmTwapPriceError = "AmmTwapPriceError",
}

export async function indexAmmMarketAccountWithContext(
  accountInfo: AccountInfo<Buffer>,
  account: PublicKey,
  context: Context
): Promise<Result<string, TaggedUnion>> {
  const ammMarketAccount = await rpcReadClient.markets.amm.decodeMarket(
    accountInfo
  );
  const baseToken = await enrichTokenMetadata(
    ammMarketAccount.baseMint,
    provider
  );
  const quoteToken = await enrichTokenMetadata(
    ammMarketAccount.quoteMint,
    provider
  );

  // if we don't have an oracle.aggregator of 0 let's run this mf
  if (ammMarketAccount.oracle.aggregator.toString() !== BN_0.toString()) {
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

    // TODO batch commits across inserts - maybe with event queue
    const twapUpsertResult = await usingDb((db) =>
      db
        .insert(schema.twaps)
        .values(newTwap)
        .onConflictDoNothing()
        .returning({ marketAcct: schema.twaps.marketAcct })
    );

    if (twapUpsertResult === undefined || twapUpsertResult.length === 0) {
      logger.error("failed to upsert twap");
      return Err({ type: AmmMarketAccountIndexingErrors.AmmTwapIndexError });
    }
  }

  let priceFromReserves: BN;

  if (ammMarketAccount.baseAmount.toString() === "0" || ammMarketAccount.baseAmount.toString() === "0") {
    logger.error("NO RESERVES", ammMarketAccount);
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
