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
    if (market.length === 0) {
      return Err({ type: AmmMarketAccountIndexingErrors.MarketMissingError });
    }

    const twapCalculation: BN = ammMarketAccount.oracle.aggregator.div(
      ammMarketAccount.oracle.lastUpdatedSlot.sub(
        ammMarketAccount.createdAtSlot
      )
    );
    const twapNumber: number = twapCalculation.toNumber();
    const newTwap: TwapRecord = {
      curTwap: BigInt(twapNumber),
      marketAcct: account.toBase58(),
      observationAgg: ammMarketAccount.oracle.aggregator.toString(),
      proposalAcct: market[0].proposalAcct ?? "",
      // alternatively, we could pass in the context of the update here
      updatedSlot: context
        ? BigInt(context.slot)
        : BigInt(ammMarketAccount.oracle.lastUpdatedSlot.toNumber()),
      lastObservation: ammMarketAccount.oracle.lastObservation.toNumber(),
      lastPrice: ammMarketAccount.oracle.lastPrice.toNumber(),
    };

    // TODO batch commits across inserts - maybe with event queue
    const twapUpsertResult = await usingDb((db) =>
      db
        .insert(schema.twaps)
        .values(newTwap)
        .onConflictDoNothing()
        .returning({ marketAcct: schema.twaps.marketAcct })
    );

    if (twapUpsertResult.length === 0) {
      logger.error("failed to upsert twap");
      return Err({ type: "AmmTwapIndexError" });
    }
  }

  const priceFromReserves = PriceMath.getAmmPriceFromReserves(
    ammMarketAccount?.baseAmount,
    ammMarketAccount?.quoteAmount
  );

  // indexing the conditional market price
  const conditionalMarketSpotPrice = getHumanPrice(
    priceFromReserves,
    baseToken.decimals!!,
    quoteToken.decimals!!
  );
  const newAmmConditionaPrice: PricesRecord = {
    marketAcct: account.toBase58(),
    updatedSlot: context
      ? BigInt(context.slot)
      : BigInt(ammMarketAccount.oracle.lastUpdatedSlot.toNumber()),
    price: conditionalMarketSpotPrice.toString(),
    pricesType: PricesType.Conditional,
    createdBy: "amm-market-indexer",
    baseAmount: BigInt(ammMarketAccount.baseAmount.toNumber()),
    quoteAmount: BigInt(ammMarketAccount.quoteAmount.toNumber()),
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
  if (pricesInsertResult.length === 0) {
    logger.error("failed to index amm price", newAmmConditionaPrice.marketAcct);
    return Err({ type: "AmmIndexPriceError" });
  }

  return Ok(`successfully indexed amm: ${account.toBase58()}`);
}
