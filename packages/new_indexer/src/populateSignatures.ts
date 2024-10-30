import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import { V4_AMM_PROGRAM_ID, V4_AUTOCRAT_PROGRAM_ID, V4_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { V3_AMM_PROGRAM_ID, V3_AUTOCRAT_PROGRAM_ID, V3_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";
import { TelegramBotAPI } from "./adapters/telegram-bot";
import { Logger } from "./logger";


const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}
const connection = new Connection(RPC_ENDPOINT);
const logger = new Logger(new TelegramBotAPI({token: process.env.TELEGRAM_BOT_API_KEY ?? ''}));

// it's possible that there are signatures BEFORE the oldest signature
// because the indexer may not have been running when those signatures were created

// it's also possible that there are signatures AFTER the newest signature

// we assume that there aren't signatures between the oldest and newest signatures

// we split these into two functions:
// - backfillHistoricalSignatures
// - insertNewSignatures

const backfillHistoricalSignatures = async (
  programId: PublicKey,
) => {
  let backfilledSignatures: ConfirmedSignatureInfo[] = [];
  let oldestSignature = await usingDb(async (db) => {
    return await db.select({ signature: schema.signatures.signature })
      .from(schema.signatures)
      .orderBy(asc(schema.signatures.slot))
      .limit(1)
      .then(signatures => signatures[0] ? signatures[0].signature : undefined);
  });

  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { before: oldestSignature, limit: 1000 },
      "confirmed"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures, programId);

    backfilledSignatures = backfilledSignatures.concat(signatures);
    oldestSignature = signatures[signatures.length - 1].signature;

    console.log(`backfilled ${backfilledSignatures.length} historical signatures so far...`);
  }

  console.log(`now done backfilling. backfilled ${backfilledSignatures.length} historical signatures`);
  return backfilledSignatures;
};

const insertNewSignatures = async (programId: PublicKey) => {
  let allSignatures: ConfirmedSignatureInfo[] = [];
  let latestRecordedSignature = await usingDb(async (db) => {
    return await db.select({ signature: schema.signatures.signature, slot: schema.signatures.slot })
      .from(schema.signatures)
      .orderBy(desc(schema.signatures.slot))
      .limit(100)
      .then(signatures => {
        if (signatures.length === 0) return undefined;

        const latestSlot = signatures[0].slot;
        for (let i = 1; i < signatures.length; i++) {
          if (signatures[i].slot < latestSlot) {
            return signatures[i].signature;
          }
        }
        return signatures[signatures.length - 1].signature;
      });
  });

  let oldestSignatureInserted: string | undefined;

  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { limit: 1000, until: latestRecordedSignature, before: oldestSignatureInserted },
      "confirmed"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures, programId);

    allSignatures = allSignatures.concat(signatures);
    oldestSignatureInserted = signatures[signatures.length - 1].signature;
  }

  return allSignatures;
}

const insertSignatures = async (signatures: ConfirmedSignatureInfo[], queriedAddr: PublicKey) => {
  await usingDb(async (db) => {
    await db.insert(schema.transactions).values(signatures.map(tx => ({
      signature: tx.signature,
      slot: BigInt(tx.slot),
      failed: tx.err !== null,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    }))).onConflictDoNothing().execute();
    await db.insert(schema.signature_accounts).values(signatures.map(tx => ({
      signature: tx.signature,
      account: queriedAddr.toString()
    }))).onConflictDoNothing().execute();
  });
}

const programIds = [V4_CONDITIONAL_VAULT_PROGRAM_ID, V4_AMM_PROGRAM_ID, V4_AUTOCRAT_PROGRAM_ID];

export const backfill = async () => {
  await Promise.all(programIds.map(async (programId) => {
    try {
      const backfilledSignatures = await backfillHistoricalSignatures(programId);
      console.log(`backfilled ${backfilledSignatures.length} signatures for ${programId.toString()}`);
    } catch (error) {
      logger.errorWithChatBotAlert([
        error instanceof Error ? 
        `Error in backfill for ${programId.toString()}: ${error.message}` : 
        `Unknown error in backfill for ${programId.toString()}`
      ]);
    }
  }));
}

export const frontfill = async () => {
  await Promise.all(programIds.map(async (programId) => {
    try {
      setInterval(async () => {
        const newSignatures = await insertNewSignatures(programId);
        console.log(`inserted up to ${newSignatures.length} new signatures for ${programId.toString()}`);
      }, 1000);
    } catch (error) {
      logger.errorWithChatBotAlert([
        error instanceof Error ? 
        `Error in backfill for ${programId.toString()}: ${error.message}` : 
        `Unknown error in backfill for ${programId.toString()}`
      ]);
    }
  }));
}

// export const populateSignatures = async () => {

//   // use promise.all so they all run concurrently
//   await Promise.all(programIds.map(programId => backfillAndSubscribe(programId)));
// };