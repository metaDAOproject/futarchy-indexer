import { IDL, OpenbookV2 } from "@themetadao/futarchy-ts/lib/idl/openbook_v2";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

export const OpenbookV2Indexer: InstructionIndexer<OpenbookV2> = {
  PROGRAM_ID: "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb",
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    console.log(`${txIdx}.${ixIdx}. OpenBookV2 ${ix.name}`);
    return Ok;
  }
};
