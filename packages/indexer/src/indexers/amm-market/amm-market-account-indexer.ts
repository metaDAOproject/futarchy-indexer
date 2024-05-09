import { AccountInfoIndexer } from "../account-info-indexer";
import { provider, rpcReadClient } from "../../connection";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { BN } from "@coral-xyz/anchor";
import { PricesType } from "@metadaoproject/indexer-db/lib/schema";
import { enrichTokenMetadata } from "@metadaoproject/futarchy-sdk";
import { PriceMath } from "@metadaoproject/futarchy-ts";
import {
  TwapRecord,
  PricesRecord,
} from "@metadaoproject/indexer-db/lib/schema";

export enum AmmAccountIndexerError {
  GeneralError = "GeneralError",
}

export const AmmMarketAccountUpdateIndexer: AccountInfoIndexer = {
  index: async (
    accountInfo: AccountInfo<Buffer>,
    account: PublicKey,
    context: Context
  ) => {
    try {
      const ammMarketAccount = await rpcReadClient.markets.amm.decodeMarket(
        accountInfo
      );
      const baseToken = await enrichTokenMetadata(
        ammMarketAccount.baseMint,
        provider
      );
      const quoteToken = await enrichTokenMetadata(
        ammMarketAccount.baseMint,
        provider
      );

      // agg is 0 so skipping
      if (ammMarketAccount.oracle.aggregator.toNumber() === 0)
        return Ok({ acct: account.toString() });

      // indexing the twap
      const twapCalculation: BN = ammMarketAccount.oracle.aggregator.div(
        ammMarketAccount.oracle.lastUpdatedSlot.sub(
          ammMarketAccount.createdAtSlot
        )
      );
      const twapNumber: number = twapCalculation.toNumber();
      const newTwap: TwapRecord = {
        curTwap: BigInt(twapNumber),
        marketAcct: account.toString(),
        observationAgg: ammMarketAccount.oracle.aggregator
          .toNumber()
          .toString(),
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
        marketAcct: account.toString(),
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
            target: [schema.prices.updatedSlot, schema.prices.marketAcct],
            set: newAmmConditionaPrice,
          })
          .returning({ marketAcct: schema.prices.marketAcct })
      );

      return Ok({ acct: pricesInsertResult[0].marketAcct });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmAccountIndexerError.GeneralError });
    }
  },
};
