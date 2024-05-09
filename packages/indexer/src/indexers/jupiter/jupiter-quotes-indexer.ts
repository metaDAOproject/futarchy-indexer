import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { Err, Ok } from "../../match";
import {
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";

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

      const newPrice: PricesRecord = {
        marketAcct: "",
        price: convertJupTokenPrice(
          tokenPriceJson,
          token[0].decimals
        ).toString(),
        pricesType: PricesType.Spot,
        updatedSlot: BigInt(tokenPriceJson.contextSlot),
      };

      const insertPriceRes = await usingDb((db) =>
        db.insert(schema.prices).values(newPrice).execute()
      );
      if ((insertPriceRes?.rowCount ?? 0) > 0) {
        return Ok({ acct });
      }
      throw "insert failed";
    } catch (e) {
      console.error(e);
      return Err({ type: "TODO" });
    }
  },
};

type JupTokenQuoteRes = {
  outAmount: string;
  inAmount: string;
  contextSlot: number;
};

const convertJupTokenPrice = (
  data: JupTokenQuoteRes,
  decimals: number
): number => {
  const price =
    Math.round(
      (Number(data.outAmount) / Number(data.inAmount)) * 1_000 * 10 ** decimals
    ) /
    10 ** decimals;
  return price;
};