import { AUTOCRAT_VERSIONS } from "@metadaoproject/futarchy-sdk/lib/constants";
import { IDL, AutocratV0 } from "@metadaoproject/futarchy-sdk/lib/idl/autocrat_v0.2";
import { InstructionIndexer, Ok } from "../instruction-indexer";
import { logger } from "../../logger";

const AUTOCRAT_V0_2 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length - 1];

if (AUTOCRAT_V0_2.label !== "V0.2") {
  const error = new Error(`Mistook autocrat ${AUTOCRAT_V0_2.label} for V0.2`);
  logger.error(error.message);
  throw error;
}

export const AutocratV0_1Indexer: InstructionIndexer<AutocratV0> = {
  PROGRAM_NAME: "AutocratV0.2",
  PROGRAM_ID: AUTOCRAT_V0_2.programId.toBase58(),
  PROGRAM_IDL: IDL,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  },
};
