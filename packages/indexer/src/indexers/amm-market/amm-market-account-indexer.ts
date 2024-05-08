import { AccountInfoIndexer } from "../account-info-indexer";
import { rpcReadClient } from "../../connection";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { BN } from "@coral-xyz/anchor";

type TwapRecord = typeof schema.twaps._.inferInsert;

export enum AmmAccountIndexerError {
  GeneralError = "GeneralError",
}

// Doing this rather than class implements pattern due to
// https://github.com/microsoft/TypeScript/issues/41399
export const AmmMarketAccountUpdateIndexer: AccountInfoIndexer = {
  index: async (
    accountInfo: AccountInfo<Buffer>,
    account: PublicKey,
    context?: Context
  ) => {
    try {
      const ammMarketAccount = await rpcReadClient.markets.amm.decodeMarket(
        accountInfo
      );
      //index twap

      // agg is 0 so skipping
      if (ammMarketAccount.oracle.aggregator.toNumber() === 0)
        return Ok({ acct: account.toString() });

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

      // TODO batch commits across inserts
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

      // TODO do an insert for prices based on base and quote from AMM (quote/base)

      return Ok({ acct: twapUpsertResult[0].marketAcct });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmAccountIndexerError.GeneralError });
    }
  },
};
