import { OPENBOOK_PROGRAM_ID } from "@themetadao/futarchy-ts/lib/constants";
import { IDL, OpenbookV2 } from "@themetadao/futarchy-ts/lib/idl/openbook_v2";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

export const OpenbookV2Indexer: InstructionIndexer<OpenbookV2> = {
  PROGRAM_ID: OPENBOOK_PROGRAM_ID.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  }
};
