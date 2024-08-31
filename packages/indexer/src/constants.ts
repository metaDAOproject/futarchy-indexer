import { Idl } from "@coral-xyz/anchor";
import {
  AMM_PROGRAM_ID,
  AUTOCRAT_PROGRAM_ID,
  AmmIDL,
  AutocratIDL,
  CONDITIONAL_VAULT_PROGRAM_ID,
  ConditionalVaultIDL,
} from "@metadaoproject/futarchy/v0.4";

export const SLOTS_TO_DAYS: Record<string, number> = {
  "648000": 3,
  "2160000": 10,
  "1080000": 5,
};

export const PROGRAM_ID_TO_IDL_MAP: Record<string, Idl> = {
  [AMM_PROGRAM_ID.toBase58()]: AmmIDL as Idl,
  [AUTOCRAT_PROGRAM_ID.toBase58()]: AutocratIDL as Idl,
  [CONDITIONAL_VAULT_PROGRAM_ID.toBase58()]: ConditionalVaultIDL as Idl,
};
