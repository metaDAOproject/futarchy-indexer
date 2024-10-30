import { OPENBOOK_PROGRAM_ID } from "@metadaoproject/futarchy-sdk";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

export const OpenbookV2Indexer: InstructionIndexer<any> = {
  PROGRAM_NAME: "OpenBookV2",
  PROGRAM_ID: OPENBOOK_PROGRAM_ID.toBase58(),
  PROGRAM_IDL: null,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  },
};
