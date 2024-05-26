import { connection, provider } from "../../connection";
import { VersionedTransactionResponse } from "@solana/web3.js";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { Err, Ok, Result, TaggedUnion } from "../../match";
import { BN } from "@coral-xyz/anchor";
import {
  OrderSide,
  OrdersRecord,
  TakesRecord,
  TransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import {
  AMM_PROGRAM_ID,
  AmmClient,
  PriceMath,
  SwapType,
} from "@metadaoproject/futarchy";
import { InstructionIndexer } from "../instruction-indexer";
import { IDL as IDLValue } from "@openbook-dex/openbook-v2";
import { AmmInstructionIndexerError } from "../../types/errors";
import { ammClient, ammParser, IDL } from "../common";
import { SwapBuilder } from "../../persisters/swap-persister";

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
        "error with indexing amm on logs subscriber",
        buildRes.error
      );
      return Err({ type: AmmInstructionIndexerError.GeneralError });
    }
    const persistable = buildRes.ok;
    await persistable.persist();
    return Ok({ txSig: transaction.txSig });
  },
};
