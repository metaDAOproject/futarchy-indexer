import { Context, Logs, PublicKey } from "@solana/web3.js";
import { Err, Ok } from "../../match";
import { AccountLogsIndexer } from "../account-logs-indexer";
import { SwapBuilder } from "../../persisters/swap-persister";
import { ammParser } from "../common";

export enum AmmAccountLogsIndexerError {
  GeneralError = "GeneralError",
}

export const AmmMarketLogsSubscribeIndexer: AccountLogsIndexer = {
  index: async (logs: Logs, account: PublicKey, context: Context) => {
    const builder = new SwapBuilder(ammParser);
    const buildRes = await builder.withSignatureAndCtx(logs.signature, context);
    if (!buildRes.success) {
      console.error(
        "error with indexing amm on logs subscriber",
        buildRes.error
      );
      return Err({ type: AmmAccountLogsIndexerError.GeneralError });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ acct: account.toBase58() });
  },
};