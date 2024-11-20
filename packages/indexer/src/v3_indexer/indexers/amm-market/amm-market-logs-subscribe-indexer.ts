import { Context, Logs, PublicKey } from "@solana/web3.js";
import { Err, Ok } from "../../match";
import { AccountLogsIndexer } from "../account-logs-indexer";
import { SwapBuilder } from "../../builders/swaps";
import { logger } from "../../../logger";
import { SwapPersistableError } from "../../types/errors";
import { GetTransactionErrorType } from "../../transaction/serializer";

export enum AmmAccountLogsIndexerError {
  GeneralError = "GeneralError",
}

export const AmmMarketLogsSubscribeIndexer: AccountLogsIndexer = {
  index: async (logs: Logs, account: PublicKey, context: Context) => {
    const builder = new SwapBuilder();
    const buildRes = await builder.withSignatureAndCtx(logs.signature, context);
    if (!buildRes.success) {
      if (
        buildRes.error.type === SwapPersistableError.NonSwapTransaction ||
        buildRes.error.type === SwapPersistableError.AlreadyPersistedSwap ||
        (buildRes.error.type === SwapPersistableError.TransactionParseError &&
          buildRes.error.value?.type ===
            GetTransactionErrorType.NullGetTransactionResponse) ||
        buildRes.error.type === SwapPersistableError.PriceError ||
        buildRes.error.type === SwapPersistableError.ArbTransactionError
      ) {
        logger.error(
          `error with indexing amm logs, signature: ${logs.signature}`,
          buildRes.error
        );
      } else {
        logger.errorWithChatBotAlert(
          `error with indexing amm logs, signature: ${logs.signature}`,
          buildRes.error
        );
      }
      return Err({
        type: AmmAccountLogsIndexerError.GeneralError,
        value: buildRes.error.type + " " + buildRes.error.value,
      });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ acct: account.toBase58() });
  },
};
