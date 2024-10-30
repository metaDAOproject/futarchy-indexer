import { AMM_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import * as anchor from "@coral-xyz/anchor";
import { CompiledInnerInstruction, PublicKey, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";

import { connection, ammClient, conditionalVaultClient } from "./connection";
import { Program } from "@coral-xyz/anchor";

import { TelegramBotAPI } from "./adapters/telegram-bot";
import { Logger } from "./logger";

import { processAmmEvent, processVaultEvent } from "./processor";

const logger = new Logger(new TelegramBotAPI({token: process.env.TELEGRAM_BOT_API_KEY ?? ''}));

const parseEvents = (transactionResponse: VersionedTransactionResponse | TransactionResponse): { ammEvents: any, vaultEvents: any } => {
  const ammEvents: { name: string; data: any }[] = [];
  const vaultEvents: { name: string; data: any }[] = [];
  try {
    const inner: CompiledInnerInstruction[] =
      transactionResponse?.meta?.innerInstructions ?? [];
    const ammIdlProgramId = ammClient.programId;
    const vaultIdlProgramId = conditionalVaultClient.vaultProgram.programId;
    for (let i = 0; i < inner.length; i++) {
      for (let j = 0; j < inner[i].instructions.length; j++) {
        const ix = inner[i].instructions[j];
        const programPubkey =
          transactionResponse?.transaction.message.staticAccountKeys[
          ix.programIdIndex
          ];
        if (!programPubkey) {
          console.log("No program pubkey");
          continue;
        }

        // get which program the instruction belongs to
        let program: Program;
        if (programPubkey.equals(ammIdlProgramId)) {
          program = ammClient.program;
          const ixData = anchor.utils.bytes.bs58.decode(
            ix.data
          );
          const eventData = anchor.utils.bytes.base64.encode(ixData.slice(8));
          const event = program.coder.events.decode(eventData);
          // console.log(event)
          if (event) {
            ammEvents.push(event);
          }
        } else if (programPubkey.equals(vaultIdlProgramId)) {
          const ixData = anchor.utils.bytes.bs58.decode(
            ix.data
          );
          const eventData = anchor.utils.bytes.base64.encode(ixData.slice(8));
          const event = program.coder.events.decode(eventData);
          // console.log(event)
          if (event) {
            vaultEvents.push(event);
          }
        } else {
          console.log("Unknown program pubkey", programPubkey.toBase58());
        }
      }
    }
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error parsing events: ${error.message}`
        : "Unknown error parsing events"
    ]);
  }

  return {
    ammEvents,
    vaultEvents
  };
}

//indexes signature
export async function index(signature: string, programId: PublicKey) {
  try {
    if (!programId.equals(AMM_PROGRAM_ID) && !programId.equals(CONDITIONAL_VAULT_PROGRAM_ID)) {
      //autocrat program id, we aren't indexing these for now
      console.log("Unknown program id: ", programId.toBase58());
      return;
    } 
    const transactionResponse = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 1 });
    if (!transactionResponse) {
      console.log("No transaction response");
      return;
    }

    const events = parseEvents(transactionResponse);
    const ammEvents = events.ammEvents;
    const vaultEvents = events.vaultEvents;

    Promise.all(ammEvents.map(async (event) => {
      await processAmmEvent(event, signature, transactionResponse);
    }));

    Promise.all(vaultEvents.map(async (event) => {
      await processVaultEvent(event, signature, transactionResponse);
    }));
    
  } catch (error) {
    logger.errorWithChatBotAlert([
      error instanceof Error
        ? `Error processing signature: ${error.message}`
        : "Unknown error processing signature"
    ]);
  }
}

