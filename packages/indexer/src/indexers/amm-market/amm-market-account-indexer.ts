import { AccountInfoIndexer } from "../account-info-indexer";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { Err, Ok } from "../../match";
import { indexAmmMarketAccountWithContext } from "./utils";
import { logger } from "../../logger";

export enum AmmAccountIndexerError {
  GeneralError = "GeneralError",
}

export const AmmMarketAccountUpdateIndexer: AccountInfoIndexer = {
  index: async (
    accountInfo: AccountInfo<Buffer>,
    account: PublicKey,
    context: Context
  ) => {
    try {
      const res = await indexAmmMarketAccountWithContext(
        accountInfo,
        account,
        context
      );

      if (res.success) {
        logger.log(res.ok);
        return Ok({ acct: account.toBase58() });
      }
      return res;
    } catch (e) {
      logger.error("general error with indexing amm market account info:", e);
      return Err({ type: AmmAccountIndexerError.GeneralError });
    }
  },
};
