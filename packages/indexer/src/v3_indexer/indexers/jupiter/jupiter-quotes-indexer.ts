import { schema, usingDb, eq, and } from "@metadaoproject/indexer-db";
import { IntervalFetchIndexer } from "../../types/interval-fetch-indexer";
import { Err, Ok } from "../../utils/match";
import {
  IndexerAccountDependencyStatus,
  PricesRecord,
  PricesType,
} from "@metadaoproject/indexer-db/lib/schema";
import { logger } from "../../../logger";

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
        updatedSlot: slot?.toString() ?? "0",
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
      logger.error("general error indexing jupiter quote: ", e);
      logger.error("account: ", acct);
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

const convertJupBaseOutTokenPrice = (
  data: JupTokenQuoteRes,
  quoteTokenDecimals: number,
  baseTokenDecimals: number
): number => {
  const inPrice = Number(data.inAmount ?? "0") / 10 ** quoteTokenDecimals;
  const outPrice = Number(data.outAmount ?? "0") / 10 ** baseTokenDecimals;
  return inPrice / outPrice;
};

export const fetchQuoteFromJupe = async (
  acct: string
): Promise<[number, number | undefined] | null> => {
  try {
    const baseToken =
      (await usingDb((db) =>
        db
          .select()
          .from(schema.tokens)
          .where(eq(schema.tokens.mintAcct, acct))
          .execute()
      )) ?? [];

    // Define the output mint based on the input token
    // TODO: this is hardcoded to USDC for now, might need to make this dynamic
    const quoteMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    const quoteToken = [{
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
      mintAcct: quoteMint,
      imageUrl: null,
      supply: 1000000n,
      updatedAt: new Date(),
    }];

    // const quoteToken =
    //   (await usingDb((db) =>
    //     db
    //       .select()
    //       .from(schema.tokens)
    //       .where(eq(schema.tokens.mintAcct, quoteMint))
    //       .execute()
    //   )) ?? [];
    
    if (baseToken.length === 0 || quoteToken.length === 0) {
      console.log("quote or base token not found in db for jupiter quotes indexer", acct);
      return null;
    }

    const amountVal = 1 * 10 ** baseToken[0].decimals;

    // Fetch ASK price (original fetch)
    const askUrl =
      `https://public.jupiterapi.com/quote?inputMint=${acct}&` +
      `outputMint=${quoteMint}&` +
      `amount=${amountVal.toString()}&` +
      "slippageBps=30&" +
      "swapMode=ExactIn&" +
      "onlyDirectRoutes=false&" +
      "maxAccounts=64&" +
      "experimentalDexes=Jupiter%20LO";
    const askRes = await fetch(askUrl);

    if (askRes.status !== 200) {
      logger.error(
        "non-200 response from Jupiter ASK quote:",
        askRes.status,
        askRes.statusText
      );
      logger.error("account: ", acct);
      if (askRes.status === 400) {
        logger.error("jupiter request is malformed");
        logger.error("account: ", acct);
        const stopJupiterRes = await usingDb((db) =>
          db.update(schema.indexerAccountDependencies).set({ status: IndexerAccountDependencyStatus.Disabled }).where(and(eq(schema.indexerAccountDependencies.acct, acct), eq(schema.indexerAccountDependencies.name, "jupiter-quotes"))).execute()
        );
        if((stopJupiterRes?.rowCount ?? 0) > 0) {
          logger.warn("jupiter dependency disabled");
        }
      }
      return null;
    }

    const askJson = (await askRes.json()) as JupTokenQuoteRes;

    if (askJson.error || !askJson.outAmount || !askJson.inAmount) {
      logger.error("Error with ASK quote response:", askJson);
      return null;
    }

    const askPrice = convertJupTokenPrice(
      askJson,
      baseToken[0].decimals,
      quoteToken[0].decimals
    );

    // Fetch BID price (swapped input/output)
    const bidUrl =
      `https://public.jupiterapi.com/quote?inputMint=${quoteMint}&` +
      `outputMint=${acct}&` +
      `amount=${(1 * 10 ** quoteToken[0].decimals).toString()}&` +
      "slippageBps=30&" +
      "swapMode=ExactIn&" +
      "onlyDirectRoutes=false&" +
      "maxAccounts=64&" +
      "experimentalDexes=Jupiter%20LO";
    const bidRes = await fetch(bidUrl);

    if (bidRes.status !== 200) {
      logger.error(
        "non-200 response from Jupiter BID quote:",
        bidRes.status,
        bidRes.statusText
      );
      if (bidRes.status === 400) {
        logger.error("jupiter request is malformed");
        const stopJupiterRes = await usingDb((db) =>
          db.update(schema.indexerAccountDependencies).set({ status: IndexerAccountDependencyStatus.Disabled }).where(and(eq(schema.indexerAccountDependencies.acct, acct), eq(schema.indexerAccountDependencies.name, "jupiter-quotes"))).execute()
        );
        if((stopJupiterRes?.rowCount ?? 0) > 0) {
          logger.error("jupiter dependency disabled");
        }
      }
      // TODO: We should really back the f-off here after like 10 times...
      return null;
    }

    const bidJson = (await bidRes.json()) as JupTokenQuoteRes;

    if (bidJson.error || !bidJson.outAmount || !bidJson.inAmount) {
      logger.error("Error with BID quote response:", bidJson);
      return null;
    }

    const bidPrice = convertJupBaseOutTokenPrice(
      bidJson,
      quoteToken[0].decimals,
      baseToken[0].decimals
    );

    if (!askPrice) {
      return [bidPrice, askJson.contextSlot];
    }
    if (!bidPrice) {
      return [askPrice, askJson.contextSlot];
    }

    // Calculate the mid-price
    const midPrice = (askPrice + bidPrice) / 2;

    // Return the mid-price and the context slot from the ASK response
    return [midPrice, askJson.contextSlot];
  } catch (e) {
    logger.error("error getting price from Jupiter: ", e);
    return null;
  }
};
