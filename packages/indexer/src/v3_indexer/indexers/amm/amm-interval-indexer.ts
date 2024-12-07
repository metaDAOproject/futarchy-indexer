import { ConfirmedSignatureInfo } from "@solana/web3.js";
import { Err, Ok } from "../../utils/match";
import { IntervalFetchIndexer } from "../../types/interval-fetch-indexer";
import { logger } from "../../../logger";
import { AmmMarketAccountIndexingErrors } from "./utils";
import { AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { SwapBuilder } from "../../builders/swaps";
import { getNewSignatures, setLatestTxSigProcessed } from "../../../utils/utils";

export enum AmmAccountIntervalIndexerError {
  General = "General",
  InvalidRPCResponse = "InvalidRPCResponse",
  BlankAccountAddr = "BlankAccountAddr",
}

export const AmmIntervalFetchIndexer: IntervalFetchIndexer = {
  cronExpression: "5/10 * * * * *", // every 10 seconds, starting at 5 seconds past the minute
  retries: 3,
  index: async (acct: string = AMM_PROGRAM_ID.toBase58()) => {
    try {
      //TODO: we need to loop until we reach latestTxSigProcessed
      let allSignatures = await getNewSignatures(AMM_PROGRAM_ID, "v0_3_amm_indexer");
      let allSignaturesOrdered = allSignatures.reverse();

      async function indexSig(signature: ConfirmedSignatureInfo) {
        const builder = new SwapBuilder();
        const res = await builder.withSignatureAndCtx(signature.signature, { slot: Number(signature.slot) });
        if (res.success) {
          logger.log(res.ok);
        } else {
          logger.errorWithChatBotAlert("error indexing v3 amm instruction", res.error);
        }
      }

      await Promise.all(allSignaturesOrdered.map(async (signature) => {
        await indexSig(signature);
      }));

      setLatestTxSigProcessed(allSignatures[0].signature, "v0_3_amm_indexer");

      return Ok({ acct: acct });

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
          logger.error("failed to index amm twap for v3 amm", acct);
        } else {
          logger.errorWithChatBotAlert("general error with indexing amm market account info interval fetcher:", e);
        }
      } else {
        logger.errorWithChatBotAlert("general error with indexing amm market account info interval fetcher:", e);
      }
      return Err({ type: AmmAccountIntervalIndexerError.General });
    }
  }
};
