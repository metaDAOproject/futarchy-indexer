import { and, eq, schema, usingDb } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { Err, Ok } from "../../match";
import {
  IndexerAccountDependencyStatus,
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";
import { logger } from "../../logger";

const apiKey = process.env.BIRDEYE_API_KEY ?? "";

enum BirdeyePricesIndexingError {
  BirdeyeFetchError = "BirdeyeFetchError",
  BirdeyeFetchMissingResponse = "BirdeyeFetchMissingResponse",
  GeneralBirdeyePricesIndexError = "GeneralBirdeyePricesIndexError",
}

export const BirdeyePricesIndexer: IntervalFetchIndexer = {
  cronExpression: "* * * * *",
  retries: 12,
  index: async (acct: string) => {
    try {
      const url = `https://public-api.birdeye.so/defi/price?address=${acct}`;
      const tokenPriceRes = await fetch(url, {
        headers: {
          "X-API-KEY": apiKey,
        },
      });

      if (tokenPriceRes.status !== 200) {
        logger.error(
          "non-200 response from birdeye:",
          tokenPriceRes.status,
          tokenPriceRes.statusText
        );
      }

      const tokenPriceJson = (await tokenPriceRes.json()) as BirdeyePricesRes;

      if (!tokenPriceJson.success) {
        logger.error(
          "error fetching from birdeye tokenPriceJson:",
          tokenPriceJson
        );
        if (tokenPriceJson.message === "Unauthorized") {
          logger.error("birdeye api key is incorrect");
          const stopBirdeyeRes = await usingDb((db) =>
            db.update(schema.indexerAccountDependencies).set({ status: IndexerAccountDependencyStatus.Disabled }).where(and(eq(schema.indexerAccountDependencies.acct, acct), eq(schema.indexerAccountDependencies.name, "birdeye-prices"))).execute()
          );
          if((stopBirdeyeRes?.rowCount ?? 0) > 0) {
            logger.error("birdeye dependency disabled");
          }
        }
        return Err({ type: BirdeyePricesIndexingError.BirdeyeFetchError });
      }

      if (!tokenPriceJson.data) {
        logger.error("bird eye prices fetch missing data");
        return Err({
          type: BirdeyePricesIndexingError.BirdeyeFetchMissingResponse,
        });
      }

      const newPrice: PricesRecord = {
        marketAcct: acct,
        price: tokenPriceJson.data?.value.toString() ?? "",
        pricesType: PricesType.Spot,
        createdBy: "birdeye-prices-indexer",
        // TODO: Fudge, birdeye doesn't have this so we might need to figure out something.. maybe just call the RPC
        updatedSlot: "0",
      };

      const insertPriceRes = await usingDb((db) =>
        db
          .insert(schema.prices)
          .values(newPrice)
          .onConflictDoNothing()
          .execute()
      );
      if ((insertPriceRes?.rowCount ?? 0) > 0) {
        console.log("inserted new birdeye price", acct);
      }
      return Ok({ acct });
    } catch (e) {
      logger.error("general error with birdeye prices indexer:", e);
      return Err({
        type: BirdeyePricesIndexingError.GeneralBirdeyePricesIndexError,
      });
    }
  },
};

type BirdeyePricesRes = {
  data?: {
    value: number;
    updateUnixTime: number;
    updateHumanTime: string;
  };
  success: boolean;
  message?: string;
};
