import { Context, Logs, PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID as V3_AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID as V3_AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID as V3_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { AmmMarketLogsSubscribeIndexer } from "./indexers/amm/amm-market-logs-subscribe-indexer";
import { AutocratDaoIndexer } from "./indexers/autocrat/autocrat-dao-indexer";
import { AutocratProposalIndexer } from "./indexers/autocrat/autocrat-proposal-indexer";


export async function indexFromLogs(logs: Logs, ctx: Context, programId: PublicKey) {
  console.log("indexFromLogs (v3):: indexing logs", logs);
  if (programId.equals(V3_AMM_PROGRAM_ID)) {
    await AmmMarketLogsSubscribeIndexer.index(logs, programId, ctx);
  } else if (programId.equals(V3_CONDITIONAL_VAULT_PROGRAM_ID)) {
    //TODO: implement
    console.log("indexFromLogs (v3):: conditional vault logs received");
    console.log(logs);
    return;
  } else if (programId.equals(V3_AUTOCRAT_PROGRAM_ID)) {
    // return;
    console.log("indexFromLogs (v3):: autocrat logs received", logs);
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
      //TODO: the autocrat proposal and dao indexer(s) doesnt take any args, but the interval indexer interface requires it. maybe fix that lol.
      if (instructionLog.includes("InitializeDao") || instructionLog.includes("UpdateDao")) {
        await AutocratDaoIndexer.index(programId.toString());
      } else if (instructionLog.includes("InitializeProposal") || 
                 instructionLog.includes("FinalizeProposal") || 
                 instructionLog.includes("ExecuteProposal")) {
        await AutocratProposalIndexer.index(programId.toString());
      }
    }
  } else {
    throw new Error(`Unknown programId ${programId.toString()}`);
  }
}