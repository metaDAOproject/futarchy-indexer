import { PublicKey, RpcResponseAndContext, AccountInfo } from "@solana/web3.js";
import { Err, Ok, Result } from "../../utils/match";
import { indexAmmMarketAccountWithContext } from "./utils";
import { IntervalFetchIndexer } from "../../types/interval-fetch-indexer";
import { rpc } from "../../../rpc-wrapper";
import { logger } from "../../../logger";
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
      const resWithContext = await rpc.call(
        "getAccountInfoAndContext",
        [account],
        "Get account info for amm market account interval fetcher"
      ) as RpcResponseAndContext<AccountInfo<Buffer> | null>;
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

  indexFromLogs: async (logs: string[]) => {
    //TODO: implement if needed
    return Err({ type: AmmAccountIntervalIndexerError.General });
  },
};
