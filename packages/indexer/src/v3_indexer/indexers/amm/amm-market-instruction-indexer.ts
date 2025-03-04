import { VersionedTransactionResponse } from "@solana/web3.js";
import { Err, Ok, Result, TaggedUnion } from "../../utils/match";
import { TransactionRecord } from "@metadaoproject/indexer-db/lib/schema";
import { AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { InstructionIndexer } from "../../types/instruction-indexer";
import {
  AmmInstructionIndexerError,
  SwapPersistableError,
} from "../../types/errors";
import { ammClient, IDL } from "../common";
import { SwapBuilder } from "../../builders/swaps";
import { logger } from "../../../logger";
import { GetTransactionErrorType } from "../../transaction/serializer";

export const AmmMarketInstructionsIndexer: InstructionIndexer<IDL> = {
  PROGRAM_ID: AMM_PROGRAM_ID.toString(),
  PROGRAM_IDL: ammClient.program.idl,
  PROGRAM_NAME: "amm",
  indexInstruction: async (
    transactionIndex: number,
    transactionResponse: VersionedTransactionResponse,
    instructionIndex: number,
    decodedInstruction: IDL["instructions"][number]
  ) => {
    return Ok({ txSig: "" });
  },
  async indexTransactionSig(transaction: TransactionRecord): Promise<
    Result<
      {
        txSig: string;
      },
      TaggedUnion
    >
  > {
    const builder = new SwapBuilder();
    const buildRes = await builder.withSignatureAndCtx(transaction.txSig, {
      slot: Number(transaction.slot),
    });
    if (!buildRes.success) {
      if (
        buildRes.error.type === SwapPersistableError.NonSwapTransaction ||
        buildRes.error.type === SwapPersistableError.AlreadyPersistedSwap ||
        buildRes.error.type === SwapPersistableError.ArbTransactionError ||
        buildRes.error.type === AmmInstructionIndexerError.FailedSwap ||
        (buildRes.error.type === SwapPersistableError.TransactionParseError &&
          buildRes.error.value?.type ===
            GetTransactionErrorType.NullGetTransactionResponse) ||
        buildRes.error.type === SwapPersistableError.PriceError
      ) {
        logger.error(
          `error with indexing amm transaction ${transaction.txSig}`,
          buildRes.error
        );
      } else {
        logger.errorWithChatBotAlert(
          `error with indexing amm transaction ${transaction.txSig}`,
          buildRes.error
        );
      }
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ txSig: transaction.txSig });
  },
};
