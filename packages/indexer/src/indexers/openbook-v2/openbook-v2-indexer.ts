import { OPENBOOK_PROGRAM_ID } from "@metadaoproject/futarchy-sdk/lib/constants";
import { IDL, OpenbookV2 } from "@metadaoproject/futarchy-sdk/lib/idl/openbook_v2";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

export const OpenbookV2Indexer: InstructionIndexer<OpenbookV2> = {
  PROGRAM_NAME: "OpenBookV2",
  PROGRAM_ID: OPENBOOK_PROGRAM_ID.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  }
};
