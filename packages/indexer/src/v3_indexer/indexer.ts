import { Context, Logs, PublicKey } from "@solana/web3.js";
import { V3_AMM_PROGRAM_ID, V3_AUTOCRAT_PROGRAM_ID, V3_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { AmmMarketLogsSubscribeIndexer } from "./amm-market/amm-market-logs-subscribe-indexer";


export async function index(logs: Logs, ctx: Context, programId: PublicKey) {
  if (programId.equals(V3_AMM_PROGRAM_ID)) {
    await AmmMarketLogsSubscribeIndexer.index(logs, programId, ctx);
  } else if (programId.equals(V3_CONDITIONAL_VAULT_PROGRAM_ID)) {
    //TODO: implement
  } else if (programId.equals(V3_AUTOCRAT_PROGRAM_ID)) {
    //TODO: implement
  } else {
    throw new Error(`Unknown programId ${programId.toString()}`);
  }
}