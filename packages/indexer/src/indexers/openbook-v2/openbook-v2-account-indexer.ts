import { AccountInfoIndexer } from "../account-info-indexer";
import { rpcReadClient } from "../../connection";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { schema, usingDb } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import {
  OpenbookMarketFetchRequest,
  getMidPrice,
} from "@metadaoproject/futarchy-sdk";
import {
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";
import { logger } from "../../logger";

export enum OpenbookV2MarketAccountIndexerError {
  MarketNotFound = "MarketNotFound",
  GeneralError = "GeneralError",
  OrderbookNotFound = "OrderbookNotFound",
  MidPriceNotFound = "MidPriceNotFound",
}

export const OpenbookV2MarketAccountUpdateIndexer: AccountInfoIndexer = {
  index: async (
    _: AccountInfo<Buffer>,
    account: PublicKey,
    context: Context
  ) => {
    try {
      const market = await rpcReadClient.markets.openbook.fetchMarket(
        new OpenbookMarketFetchRequest(account, null as any)
      );

      if (!market) {
        logger.error("Failed to fetch market");
        return Err({
          type: OpenbookV2MarketAccountIndexerError.MarketNotFound,
        });
      }

      const orderbook = await rpcReadClient.markets.openbook.fetchOrderBook(
        market
      );
      if (!orderbook) {
        logger.error("Failed to fetch order book");
        return Err({
          type: OpenbookV2MarketAccountIndexerError.OrderbookNotFound,
        });
      }

      const midPrice = getMidPrice(orderbook);
      if (!midPrice) {
        logger.error("Failed to calculate mid price");
        return Err({
          type: OpenbookV2MarketAccountIndexerError.MidPriceNotFound,
        });
      }

      // update the latest slot here
      const newOpenbookConditionaPrice: PricesRecord = {
        marketAcct: account.toString(),
        updatedSlot: context.slot.toString(),
        price: midPrice.toString(),
        pricesType: PricesType.Conditional,
        baseAmount: 
          market.marketInstance.account.baseDepositTotal.toString()
        ,
        quoteAmount: 
          market.marketInstance.account.quoteDepositTotal.toString()
        ,
        createdBy: "openbook-v2-account-indexer",
      };

      const pricesInsertResult =
        (await usingDb((db) =>
          db
            .insert(schema.prices)
            .values(newOpenbookConditionaPrice)
            .onConflictDoUpdate({
              target: [schema.prices.createdAt, schema.prices.marketAcct],
              set: newOpenbookConditionaPrice,
            })
            .returning({ marketAcct: schema.prices.marketAcct })
        )) ?? [];

      return Ok({ acct: pricesInsertResult[0].marketAcct });
    } catch (error) {
      logger.error(
        "Unexpected error in openbook v2 market info index function:",
        error
      );
      return Err({
        type: OpenbookV2MarketAccountIndexerError.GeneralError,
        error,
      });
    }
  },
};
