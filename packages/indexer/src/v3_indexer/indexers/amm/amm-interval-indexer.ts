import { PublicKey, ConfirmedSignatureInfo, VersionedTransactionResponse } from "@solana/web3.js";
import { Err, Ok, Result } from "../../utils/match";
import { IntervalFetchIndexer } from "../../types/interval-fetch-indexer";
import { rpc } from "../../../rpc-wrapper";
import { logger } from "../../../logger";
import { AmmMarketAccountIndexingErrors } from "./utils";
import { AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { SwapBuilder } from "../../builders/swaps";

export enum AmmAccountIntervalIndexerError {
  General = "General",
  InvalidRPCResponse = "InvalidRPCResponse",
  BlankAccountAddr = "BlankAccountAddr",
}

//get latestTxSigProcessed
async function getLatestTxSigProcessed() {
  return await usingDb(async (db) => {
    return await db.select({ signature: schema.indexers.latestTxSigProcessed })
      .from(schema.indexers)
      .where(eq(schema.indexers.name, "v0_3_amm_indexer"))
      .then(signatures => signatures[0] ? signatures[0].signature as string : undefined);
  });
}

//set latestTxSigProcessed
async function setLatestTxSigProcessed(signature: string) {
  await usingDb(async (db) => {
    await db.update(schema.indexers).set({ latestTxSigProcessed: signature }).where(eq(schema.indexers.name, "v0_3_amm_indexer")).execute();
  });
}

export const AmmIntervalFetchIndexer: IntervalFetchIndexer = {
  cronExpression: "55 * * * * *", // 55 seconds past the minute
  retries: 3,
  index: async (acct: string = AMM_PROGRAM_ID.toBase58()) => {
    try {
      //TODO: we need to loop until we reach latestTxSigProcessed
      let allSignatures: ConfirmedSignatureInfo[] = [];
      const latestRecordedSignature = await getLatestTxSigProcessed();
      let oldestSignatureInserted: string | undefined;
      while (true) {
        const signatures = await rpc.call(
          "getSignaturesForAddress",
          [AMM_PROGRAM_ID, { limit: 1000, until: latestRecordedSignature, before: oldestSignatureInserted }, "confirmed"],
          "Get new signatures"
        ) as ConfirmedSignatureInfo[];

        if (signatures.length === 0) break;

        allSignatures = allSignatures.concat(signatures);
        if (!oldestSignatureInserted) setLatestTxSigProcessed(signatures[0].signature); //since getSignaturesForAddress is a backwards walk, this should be the latest signature
        oldestSignatureInserted = signatures[signatures.length - 1].signature;
      }

      async function indexSig(signature: ConfirmedSignatureInfo) {
        const builder = new SwapBuilder();
        const res = await builder.withSignatureAndCtx(signature.signature, { slot: Number(signature.slot) });
        if (res.success) {
          logger.log(res.ok);
        } else {
          logger.errorWithChatBotAlert("error indexing v3 amm instruction", res.error);
        }
      }

      await Promise.all(allSignatures.map(async (signature) => {
        await indexSig(signature);
      }));

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
          logger.error("failed to index amm twap for v4 amm", acct);
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
