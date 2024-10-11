import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { provider } from "../../connection";
import { usingDb, schema, eq } from "@metadaoproject/indexer-db";
import { Err, Ok } from "../../match";
import { PublicKey } from "@solana/web3.js";
import { TokenRecord } from "@metadaoproject/indexer-db/lib/schema";
import { TokenAccountNotFoundError, getMint } from "@solana/spl-token";
import { logger } from "../../logger";

export enum TokenMintIndexerError {
  GeneralError = "GeneralError",
  MissingParamError = "MissingParamError",
  NotFoundError = "NotFoundError",
  MissingChainResponseError = "MissingChainResponseError",
  NothingToInsertError = "NothingToInsertError",
}

export const TokenMintIndexer: IntervalFetchIndexer = {
  cronExpression: "5 * * * * *",
  retries: 10,
  index: async (mintStr: string) => {
    try {
      let mint = new PublicKey(mintStr);

      let storedMint;
      try {
        storedMint = await getMint(provider.connection, mint);
      } catch (err) {
        if (err instanceof TokenAccountNotFoundError) {
          logger.error(`Mint ${mint.toString()} not found`);
          return Err({ type: TokenMintIndexerError.NotFoundError });
        } else {
          throw err;
        }
      }

      const dbMint: TokenRecord | undefined = (
        await usingDb((db) =>
          db
            .select()
            .from(schema.tokens)
            .where(eq(schema.tokens.mintAcct, mint.toString()))
            .execute()
        )
      )?.[0];

      if (!dbMint) return;

      if (dbMint.supply !== storedMint.supply) {
        await usingDb((db) =>
          db
            .update(schema.tokens)
            .set({ supply: storedMint.supply, updatedAt: new Date() })
            .where(eq(schema.tokens.mintAcct, mint.toString()))
            .execute()
        );
        console.log(
          `Updated supply for mint ${mint.toString()} from ${
            dbMint.supply
          } to ${storedMint.supply}`
        );
      }

      return Ok({ acct: "urmom" });
    } catch (err) {
      logger.errorWithChatBotAlert(err);
      return Err({ type: TokenMintIndexerError.GeneralError });
    }
  },
};
