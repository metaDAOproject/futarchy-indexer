import { AUTOCRAT_VERSIONS } from "@themetadao/futarchy-ts/lib/constants";
import { IDL, AutocratV0 } from "@themetadao/futarchy-ts/lib/idl/autocrat_v0";
import { Err, InstructionIndexer, Ok } from "../instruction-indexer";
import logger from "../../logger";

const AUTOCRAT_V0 = AUTOCRAT_VERSIONS[AUTOCRAT_VERSIONS.length - 1];

if (AUTOCRAT_V0.label !== "V0") {
  const error = new Error(`Mistook autocrat ${AUTOCRAT_V0.label} for V0`);
  logger.error(error.message);
  throw error;
}

export const AutocratV0Indexer: InstructionIndexer<AutocratV0> = {
  PROGRAM_NAME: "AutocrateV0",
  PROGRAM_ID: AUTOCRAT_V0.programId.toBase58(),
  PROGRAM_IDL: AUTOCRAT_V0.idl as any,
  indexInstruction: async (dbTx, txIdx, txRes, ixIdx, ix) => {
    return Ok;
  },
};
