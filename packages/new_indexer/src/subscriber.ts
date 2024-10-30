import { connection } from "./connection";
import { Logs, PublicKey } from "@solana/web3.js";
import { V4_AMM_PROGRAM_ID, V4_AUTOCRAT_PROGRAM_ID, V4_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { V3_AMM_PROGRAM_ID, V3_AUTOCRAT_PROGRAM_ID, V3_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { IndexerImplementation } from "@metadaoproject/indexer-db/lib/schema";
import { AccountLogsIndexer } from "./account-logs-indexer";
import { AmmMarketLogsSubscribeIndexer } from "./amm-market/amm-market-logs-subscribe-indexer";
import { logger } from "../logger";
import { processSignature } from "./v4_indexer/indexer";

async function processLogs(logs: Logs, programId: PublicKey) {
  //check if programId is v3 or v4
  if (programId.equals(V4_AMM_PROGRAM_ID) || programId.equals(V4_AUTOCRAT_PROGRAM_ID) || programId.equals(V4_CONDITIONAL_VAULT_PROGRAM_ID)) {
    await processLogsV4(logs, programId);
  } else if (programId.equals(V3_AMM_PROGRAM_ID) || programId.equals(V3_AUTOCRAT_PROGRAM_ID) || programId.equals(V3_CONDITIONAL_VAULT_PROGRAM_ID)) {
    await processLogsV3(logs, programId);
  } else {
    logger.error(`Unknown programId ${programId.toString()}`);
  }
}

async function processLogsV4(logs: Logs, programId: PublicKey) {
  let signature = logs.signature;
  await processSignature(signature);
}

async function processLogsV3(logs: Logs, programId: PublicKey) {
  
} 

//subscribes to logs for a given account
async function subscribe(accountPubKey: PublicKey) {
  connection.onLogs(accountPubKey, async (logs: Logs) => { //TODO: maybe add commitment "confirmed" (rpc docs doesnt say if this is default)
    try {
      // wait here because we need to fetch the txn from RPC
      // and often we get no response if we try right after recieving the logs notification
      await new Promise((resolve) => setTimeout(resolve, 1500));
      processLogs(logs, accountPubKey); //trigger processing of logs
    } catch (error) {
      logger.errorWithChatBotAlert(`Error processing logs for account ${accountPubKey.toString()}`, error);
    }
  });
}

//asynchronously subscribes to logs for all programs
export async function subscribeAll() {
  const programIds = [
    V4_AMM_PROGRAM_ID,
    V4_AUTOCRAT_PROGRAM_ID,
    V4_CONDITIONAL_VAULT_PROGRAM_ID,
    V3_AMM_PROGRAM_ID,
    V3_AUTOCRAT_PROGRAM_ID,
    V3_CONDITIONAL_VAULT_PROGRAM_ID
  ];
  Promise.all(programIds.map(async (programId) => subscribe(programId)));
}




