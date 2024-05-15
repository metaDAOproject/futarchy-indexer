import { BN } from "@coral-xyz/anchor";
import { BN_0, enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { PriceMath } from "@metadaoproject/futarchy-ts";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { PricesType } from "@metadaoproject/indexer-db/lib/schema";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { provider, rpcReadClient } from "../../connection";
import { Err, Ok, Result, TaggedUnion } from "../../match";

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

  // agg is 0 so skipping
  if (ammMarketAccount.oracle.aggregator.toString() === BN_0.toString())
    return Ok(`skipping account: ${account.toBase58()}`);

  // indexing the twap
  const twapCalculation: BN = ammMarketAccount.oracle.aggregator.div(
    ammMarketAccount.oracle.lastUpdatedSlot.sub(ammMarketAccount.createdAtSlot)
  );
  const twapNumber: number = twapCalculation.toNumber();
  const newTwap: TwapRecord = {
    curTwap: BigInt(twapNumber),
    marketAcct: account.toBase58(),
    observationAgg: ammMarketAccount.oracle.aggregator.toString(),
    proposalAcct: ammMarketAccount.proposal.toString(),
    // alternatively, we could pass in the context of the update here
    updatedSlot: context
      ? BigInt(context.slot)
      : BigInt(ammMarketAccount.oracle.lastUpdatedSlot.toNumber()),
  };

  // TODO batch commits across inserts - maybe with event queue
  const twapUpsertResult = await usingDb((db) =>
    db
      .insert(schema.twaps)
      .values(newTwap)
      .onConflictDoUpdate({
        target: [schema.twaps.updatedSlot, schema.twaps.marketAcct],
        set: newTwap,
      })
      .returning({ marketAcct: schema.twaps.marketAcct })
  );

  if (twapUpsertResult.length === 0) {
    console.error("failed to upsert twap");
    return Err({ type: "AmmTwapIndexError" });
  }

  // indexing the conditional market price
  const conditionalMarketSpotPrice = PriceMath.getHumanPrice(
    PriceMath.getAmmPriceFromReserves(
      ammMarketAccount?.baseAmount,
      ammMarketAccount?.quoteAmount
    ),
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
    console.error(
      "failed to index amm price",
      newAmmConditionaPrice.marketAcct
    );
    return Err({ type: "AmmIndexPriceError" });
  }

  return Ok(`successfully indexed amm: ${account.toBase58()}`);
}
