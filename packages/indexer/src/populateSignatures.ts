import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";
import { TelegramBotAPI } from "./adapters/telegram-bot";
import { Logger } from "./logger";
import { all } from "axios";

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
  try {
    let oldestSignature;
    try {
      oldestSignature = await usingDb(async (db) => {
        // TODO use an index on slot or some other performance optimization
        return await db.select({ signature: schema.signatures.signature })
          .from(schema.signatures)
          .orderBy(asc(schema.signatures.slot))
          .limit(1)
          .then(signatures => signatures[0] ? signatures[0].signature : undefined);
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error fetching oldest signature: ${error.message}`);
      } else {
        logger.error('Unknown error occurred while fetching oldest signature');
      }
      throw error; // Re-throw the error to be caught by the outer try-catch
    }

    try {
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`Error while backfilling signatures: ${error.message}`);
      } else {
        logger.error('Unknown error occurred while backfilling signatures');
      }
      throw error;
    }

    console.log(`now done backfilling. backfilled ${backfilledSignatures.length} historical signatures`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.errorWithChatBotAlert([`Error: ${error.message}`]);
    } else {
      logger.errorWithChatBotAlert([`Error: Unknown error in backfillHistoricalSignatures()`]);
    }
  }
  return backfilledSignatures;
};

const insertNewSignatures = async (programId: PublicKey) => {
  let allSignatures: ConfirmedSignatureInfo[] = [];
  try {
    let latestRecordedSignature;
    try {
      latestRecordedSignature = await usingDb(async (db) => {
        return await db.select({ signature: schema.signatures.signature, slot: schema.signatures.slot })
          .from(schema.signatures)
          .orderBy(desc(schema.signatures.slot))
          .limit(100)
          .then(signatures => {
            if (signatures.length === 0) return undefined;

            // we don't want to return a signature in the highest slot
            // because there could have been more recent signatures in
            // that slot that we haven't stored yet
            const latestSlot = signatures[0].slot;
            for (let i = 1; i < signatures.length; i++) {
              if (signatures[i].slot < latestSlot) {
                return signatures[i].signature;
              }
            }
            return signatures[signatures.length - 1].signature;
          });
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.errorWithChatBotAlert([`Error: ${error.message}`]);
      } else {
        logger.errorWithChatBotAlert([`Error: Error getting latestRecordedSignature`]);
      }
      throw error;
    }

    let oldestSignatureInserted: string | undefined;

    try {
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.errorWithChatBotAlert([`Error fetching signatures: ${error.message}`]);
      } else {
        logger.errorWithChatBotAlert([`Error fetching signatures: Unknown error while fetching signatures`]);
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.errorWithChatBotAlert([`Error inserting new signatures: ${error.message}`]);
    } else {
      logger.errorWithChatBotAlert([`Error inserting new signatures: Unknown error in insertNewSignatures()`]);
    }
  }
  return allSignatures;
}

const insertSignatures = async (signatures: ConfirmedSignatureInfo[], queriedAddr: PublicKey) => {
  try {
    await usingDb(async (db) => {
      await db.insert(schema.signatures).values(signatures.map(tx => ({
        signature: tx.signature,
        queriedAddr: queriedAddr.toString(),
        slot: BigInt(tx.slot),
        didErr: tx.err !== null,
        err: tx.err ? JSON.stringify(tx.err) : null,
        blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
      }))).onConflictDoNothing().execute();
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.errorWithChatBotAlert([`Error inserting signatures: ${error.message}`]);
    } else {
      logger.errorWithChatBotAlert([`Error inserting signatures: Error inserting signatures to signatures table`]);
    }
  }
}

const backfillAndSubscribe = async (programId: PublicKey) => {
  try {
    const backfilledSignatures = await backfillHistoricalSignatures(programId);
    console.log(`backfilled ${backfilledSignatures.length} signatures for ${programId.toString()}`);

    setInterval(async () => {
      const newSignatures = await insertNewSignatures(programId);
      console.log(`inserted up to ${newSignatures.length} new signatures for ${programId.toString()}`);
    }, 1000);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.errorWithChatBotAlert([`Error in backfillAndSubscribe for ${programId.toString()}: ${error.message}`]);
    } else {
      logger.errorWithChatBotAlert([`Unknown error in backfillAndSubscribe for ${programId.toString()}`]);
    }
  }
}

export const populateSignatures = async () => {
  const programIds = [CONDITIONAL_VAULT_PROGRAM_ID, AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID];

  // use promise.all so they all run concurrently
  await Promise.all(programIds.map(programId => backfillAndSubscribe(programId)));
};