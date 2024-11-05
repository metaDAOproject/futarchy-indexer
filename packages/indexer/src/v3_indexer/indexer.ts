import { Context, Logs, PublicKey } from "@solana/web3.js";
import { V3_AMM_PROGRAM_ID, V3_AUTOCRAT_PROGRAM_ID, V3_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { AmmMarketLogsSubscribeIndexer } from "./amm-market/amm-market-logs-subscribe-indexer";
import { AutocratDaoIndexer } from "./autocrat/autocrat-dao-indexer";
import { AutocratProposalIndexer } from "./autocrat/autocrat-proposal-indexer";


export async function index(logs: Logs, ctx: Context, programId: PublicKey) {
  if (programId.equals(V3_AMM_PROGRAM_ID)) {
    await AmmMarketLogsSubscribeIndexer.index(logs, programId, ctx);
  } else if (programId.equals(V3_CONDITIONAL_VAULT_PROGRAM_ID)) {
    //TODO: implement
  } else if (programId.equals(V3_AUTOCRAT_PROGRAM_ID)) {
    // Parse logs to find instruction type
    const instructionLog = logs.logs.find(log => 
      log.includes("Instruction:") && 
      (log.includes("InitializeDao") || 
       log.includes("InitializeProposal") || 
       log.includes("FinalizeProposal") || 
       log.includes("ExecuteProposal") ||
       log.includes("UpdateDao"))
    );

    if (instructionLog) {
      if (instructionLog.includes("InitializeDao") || instructionLog.includes("UpdateDao")) {
        // Trigger DAO indexer to update/insert new DAO
        await AutocratDaoIndexer.index();
      } else if (instructionLog.includes("InitializeProposal") || 
                 instructionLog.includes("FinalizeProposal") || 
                 instructionLog.includes("ExecuteProposal")) {
        // Trigger Proposal indexer to update/insert new proposal or update status
        await AutocratProposalIndexer.index();
      }
    }
  } else {
    throw new Error(`Unknown programId ${programId.toString()}`);
  }
}