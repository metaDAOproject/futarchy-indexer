import { schema, usingDb } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { Err, Ok } from "../../match";
import {
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";

const apiKey = process.env.BIRDEYE_API_KEY ?? "";

enum BirdeyePricesIndexingError {
  BirdeyeFetchError = "BirdeyeFetchError",
  BirdeyeFetchMissingResponse = "BirdeyeFetchMissingResponse",
  GeneralBirdeyePricesIndexError = "GeneralBirdeyePricesIndexError",
}

export const BirdeyePricesIndexer: IntervalFetchIndexer = {
  intervalMs: 60_000,
  index: async (acct: string) => {
    try {
      const url = `https://public-api.birdeye.so/defi/price?address=${acct}`;
      const tokenPriceRes = await fetch(url, {
        headers: {
          "X-API-KEY": apiKey,
        },
      });
      const tokenPriceJson = (await tokenPriceRes.json()) as BirdeyePricesRes;

      if (!tokenPriceJson.success) {
        return Err({ type: BirdeyePricesIndexingError.BirdeyeFetchError });
      }

      if (!tokenPriceJson.data) {
        return Err({
          type: BirdeyePricesIndexingError.BirdeyeFetchMissingResponse,
        });
      }

      const newPrice: PricesRecord = {
        marketAcct: acct,
        price: tokenPriceJson.data?.value.toString() ?? "",
        pricesType: PricesType.Spot,
        // TODO: Fudge, birdeye doesn't have this so we might need to figure out something.. maybe just call the RPC
        updatedSlot: BigInt(0),
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
      console.error(e);
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
};