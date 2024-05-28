import { VersionedTransactionResponse } from "@solana/web3.js";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { TransactionRecord } from "@metadaoproject/indexer-db/lib/schema";
import { AMM_PROGRAM_ID } from "@metadaoproject/futarchy";
import { InstructionIndexer } from "../instruction-indexer";
import { AmmInstructionIndexerError } from "../../types/errors";
import { ammClient, ammParser, IDL } from "../common";
import { SwapBuilder } from "../../builders/swaps";

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
    try {
      return Ok({ txSig: "" });
    } catch (e) {
      console.error(e);
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
  },
  async indexTransactionSig(transaction: TransactionRecord): Promise<
    Result<
      {
        txSig: string;
      },
      TaggedUnion
    >
  > {
    const builder = new SwapBuilder(ammParser);
    const buildRes = await builder.withSignatureAndCtx(transaction.txSig, {
      slot: Number(transaction.slot),
    });
    if (!buildRes.success) {
      console.error(
        `error with indexing amm on logs instruction tx ${transaction.txSig}`,
        buildRes.error
      );
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ txSig: transaction.txSig });
  },
};
