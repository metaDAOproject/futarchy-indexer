import { SolanaParser } from "@debridge-finance/solana-transaction-parser";
import { AmmClient, AMM_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { provider } from "../connection";

export const ammClient = new AmmClient(provider, AMM_PROGRAM_ID, []);
export type IDL = typeof ammClient.program.idl;
export const ammParser = new SolanaParser([
  {
    idl: ammClient.program.idl,
    programId: AMM_PROGRAM_ID,
  },
]);
