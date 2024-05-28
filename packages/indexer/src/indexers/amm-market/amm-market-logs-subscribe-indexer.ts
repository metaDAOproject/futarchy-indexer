import { Context, Logs, PublicKey } from "@solana/web3.js";
import { Err, Ok } from "../../match";
import { AccountLogsIndexer } from "../account-logs-indexer";
import { SwapBuilder } from "../../builders/swaps";
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
        `error with indexing amm on logs subscriber tx ${logs.signature}`,
        buildRes.error
      );
      return Err({ type: AmmAccountLogsIndexerError.GeneralError });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ acct: account.toBase58() });
  },
};
