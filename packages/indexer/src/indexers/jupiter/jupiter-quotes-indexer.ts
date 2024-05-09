import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { Err, Ok } from "../../match";
import {
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";

enum JupiterQuoteIndexingError {
  JupiterFetchError = "JupiterFetchError",
  GeneralJupiterQuoteIndexError = "GeneralJupiterQuoteIndexError",
}

export const JupiterQuotesIndexer: IntervalFetchIndexer = {
  intervalMs: 60_000,
  index: async (acct: string) => {
    // get decimals from our DB
    try {
      const token = await usingDb((db) =>
        db
          .select()
          .from(schema.tokens)
          .where(eq(schema.tokens.mintAcct, acct))
          .execute()
      );
      // call jup
      const url =
        `https://quote-api.jup.ag/v6/quote?inputMint=${acct}&` +
        "outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&" +
        `amount=${(100_000).toString()}&` +
        "slippageBps=50&" +
        "swapMode=ExactIn&" +
        "onlyDirectRoutes=false&" +
        "maxAccounts=64&" +
        "experimentalDexes=Jupiter%20LO";
      const tokenPriceRes = await fetch(url);
      const tokenPriceJson = (await tokenPriceRes.json()) as JupTokenQuoteRes;

      if (tokenPriceJson.error) {
        return Err({ type: JupiterQuoteIndexingError.JupiterFetchError });
      }

      const newPrice: PricesRecord = {
        marketAcct: acct,
        price: convertJupTokenPrice(
          tokenPriceJson,
          token[0].decimals
        ).toString(),
        pricesType: PricesType.Spot,
        updatedSlot: BigInt(tokenPriceJson.contextSlot ?? 0),
      };

      const insertPriceRes = await usingDb((db) =>
        db
          .insert(schema.prices)
          .values(newPrice)
          .onConflictDoNothing()
          .execute()
      );
      if ((insertPriceRes?.rowCount ?? 0) > 0) {
        console.log("inserted new jup quote price", acct);
      }
      return Ok({ acct });
    } catch (e) {
      console.error(e);
      return Err({
        type: JupiterQuoteIndexingError.GeneralJupiterQuoteIndexError,
      });
    }
  },
};

type JupTokenQuoteRes = {
  outAmount?: string;
  inAmount?: string;
  contextSlot?: number;
  error?: string;
};

const convertJupTokenPrice = (
  data: JupTokenQuoteRes,
  decimals: number
): number => {
  const price =
    Math.round(
      (Number(data.outAmount ?? "0") / Number(data.inAmount ?? "0")) *
        1_000 *
        10 ** decimals
    ) /
    10 ** decimals;
  return price;
};
