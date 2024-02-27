import { AUTOCRAT_VERSIONS } from "@themetadao/futarchy-ts/lib/constants";
import { IDL, AutocratV0 } from "@themetadao/futarchy-ts/lib/idl/autocrat_v0.1";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";

const AUTOCRAT_V0_1 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length - 2];

if (AUTOCRAT_V0_1.label !== "V0.1") {
  throw new Error(`Mistook autocrat ${AUTOCRAT_V0_1.label} for V0.1`);
}

export const AutocratV0_1Indexer: InstructionIndexer<AutocratV0> = {
  PROGRAM_ID: AUTOCRAT_V0_1.programId.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  }
};
