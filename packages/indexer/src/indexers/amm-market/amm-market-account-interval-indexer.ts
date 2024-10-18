import { PublicKey } from "@solana/web3.js";
import { Err, Ok, Result } from "../../match";
import { indexAmmMarketAccountWithContext } from "./utils";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { connection } from "../../connection";
import { logger } from "../../logger";
import { AmmMarketAccountIndexingErrors } from "./utils";

export enum AmmAccountIntervalIndexerError {
  General = "General",
  InvalidRPCResponse = "InvalidRPCResponse",
  BlankAccountAddr = "BlankAccountAddr",
}

export const AmmMarketAccountIntervalFetchIndexer: IntervalFetchIndexer = {
  cronExpression: "50 * * * * *",
  retries: 3,
  index: async (acct: string) => {
    if (acct === "") {
      return Err({
        type: AmmAccountIntervalIndexerError.BlankAccountAddr,
      });
    }
    try {
      const account = new PublicKey(acct);
      const resWithContext = await connection.getAccountInfoAndContext(account);
      if (!resWithContext.value) {
        return Err({
          type: AmmAccountIntervalIndexerError.InvalidRPCResponse,
        });
      }

      const res = await indexAmmMarketAccountWithContext(
        resWithContext.value,
        account,
        resWithContext.context
      );

      if (res.success) {
        logger.log(res.ok);
        return Ok({ acct: account.toBase58() });
      }
      return res;
    } catch (e) {
      if (
        e instanceof Object &&
        'success' in e &&
        !e.success &&
        'error' in e &&
        typeof e.error === 'object' &&
        e.error !== null &&
        'type' in e.error
      ) {
        if (e.error.type === AmmMarketAccountIndexingErrors.AmmV4TwapIndexError) {
          logger.error("failed to index amm twap for v4 amm", acct);
        } else {
          logger.errorWithChatBotAlert("general error with indexing amm market account info interval fetcher:", e);
        }
      } else {
        logger.errorWithChatBotAlert("general error with indexing amm market account info interval fetcher:", e);
      }
      return Err({ type: AmmAccountIntervalIndexerError.General });
    }
  },
};
