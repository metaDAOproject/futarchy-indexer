import { PublicKey } from "@solana/web3.js";
import { Err, Ok } from "../../match";
import { indexAmmMarketAccountWithContext } from "./utils";
import { IntervalFetchIndexer } from "../interval-fetch-indexer";
import { connection } from "../../connection";

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
        console.log(res.ok);
        return Ok({ acct: account.toBase58() });
      }
      return res;
    } catch (e) {
      console.error("general error with indexing amm market account info:", e);
      return Err({ type: AmmAccountIntervalIndexerError.General });
    }
  },
};
