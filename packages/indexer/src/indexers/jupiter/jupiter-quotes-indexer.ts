import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { Err, Ok } from "../../match";
import {
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";

export enum JupiterQuoteIndexingError {
  JupiterFetchError = "JupiterFetchError",
  GeneralJupiterQuoteIndexError = "GeneralJupiterQuoteIndexError",
}

export const JupiterQuotesIndexer: IntervalFetchIndexer = {
  cronExpression: "* * * * *",
  retries: 12,
  index: async (acct: string) => {
    // get decimals from our DB
    try {
      const fetchQuoteRes = await fetchQuoteFromJupe(acct);
      if (!fetchQuoteRes) {
        return Err({
          type: JupiterQuoteIndexingError.JupiterFetchError,
        });
      }
      const [price, slot] = fetchQuoteRes;
      const newPrice: PricesRecord = {
        marketAcct: acct,
        price: price.toString(),
        pricesType: PricesType.Spot,
        createdBy: "jupiter-quotes-indexer",
        updatedSlot: BigInt(slot ?? 0),
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
      console.error("general error indexing jupiter quote: ", e);
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
  inputTokenDecimals: number,
  outputTokenDecimals: number
): number => {
  const price =
    Number(data.outAmount ?? "0") /
    10 ** outputTokenDecimals /
    (Number(data.inAmount ?? "0") / 10 ** inputTokenDecimals);
  return price;
};

export const fetchQuoteFromJupe = async (
  acct: string
): Promise<[number, number | undefined] | null> => {
  try {
    const inputToken = await usingDb((db) =>
      db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.mintAcct, acct))
        .execute()
    );
    // call jup

    // if it's USDC we compare to USDT
    const outputMint =
      acct === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        ? "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
        : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    const outputToken = await usingDb((db) =>
      db
        .select()
        .from(schema.tokens)
        .where(eq(schema.tokens.mintAcct, outputMint))
        .execute()
    );

    const url =
      `https://quote-api.jup.ag/v6/quote?inputMint=${acct}&` +
      `outputMint=${outputMint}&` +
      `amount=${(100_000).toString()}&` +
      "slippageBps=50&" +
      "swapMode=ExactIn&" +
      "onlyDirectRoutes=false&" +
      "maxAccounts=64&" +
      "experimentalDexes=Jupiter%20LO";
    const tokenPriceRes = await fetch(url);

    if (tokenPriceRes.status !== 200) {
      console.error(
        "non-200 response from jupiter quotes:",
        tokenPriceRes.status,
        tokenPriceRes.statusText
      );
    }

    const tokenPriceJson = (await tokenPriceRes.json()) as JupTokenQuoteRes;

    if (tokenPriceJson.error) {
      return null;
    }

    if (!tokenPriceJson.outAmount || !tokenPriceJson.inAmount) {
      console.error("token price output or input is 0 value");
      return null;
    }
    return [
      convertJupTokenPrice(
        tokenPriceJson,
        inputToken[0].decimals,
        outputToken[0].decimals
      ),
      tokenPriceJson.contextSlot,
    ];
  } catch (e) {
    console.error("error getting price number from jupiter: ", e);
    return null;
  }
};
