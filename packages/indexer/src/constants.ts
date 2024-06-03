import { Idl } from "@coral-xyz/anchor";
import { AMM_PROGRAM_ID, AmmIDL } from "@metadaoproject/futarchy";

export const SLOTS_TO_DAYS: Record<string, number> = {
  "648000": 3,
  "2160000": 10,
  "1080000": 5,
};

export const PROGRAM_ID_TO_IDL_MAP: Record<string, Idl> = {
  [AMM_PROGRAM_ID.toBase58()]: AmmIDL,
};
