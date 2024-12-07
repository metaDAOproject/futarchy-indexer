import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID as V4_AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID as V4_AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID as V4_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";
import { TelegramBotAPI } from "../adapters/telegram-bot";
import { Logger } from "../logger";
import { index } from "./indexer";
import { rpc } from "../rpc-wrapper";
import { setLatestTxSigProcessed, getNewSignatures } from "../utils/utils";

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
    const signatures = await rpc.call(
      "getSignaturesForAddress",
      [programId, { before: oldestSignature, limit: 1000 }, "confirmed"],
      "Get historical signatures"
    ) as ConfirmedSignatureInfo[];

    if (signatures.length === 0) break;

    await insertSignatures(signatures, programId);

    //trigger indexing
    Promise.all(signatures.map(async (signature: ConfirmedSignatureInfo) => {
      await index(signature.signature, programId);
    }));

    backfilledSignatures = backfilledSignatures.concat(signatures);
    oldestSignature = signatures[signatures.length - 1].signature;

    console.log(`backfilled ${backfilledSignatures.length} historical signatures so far...`);
  }

  console.log(`now done backfilling. backfilled ${backfilledSignatures.length} historical signatures`);
  return backfilledSignatures;
};

const insertNewSignatures = async (programId: PublicKey) => {
  let allSignatures: ConfirmedSignatureInfo[] = await getNewSignatures(programId, "v0_4_amm_interval_indexer");
  //insert signatures and index, setLatestTxSigProcess after indexing
  await insertSignatures(allSignatures, programId);
  await Promise.all(allSignatures.map(async (signature: ConfirmedSignatureInfo) => {
    await index(signature.signature, programId);
  }));
  setLatestTxSigProcessed(allSignatures[0].signature, "v0_4_amm_interval_indexer");
  return allSignatures;
}

const insertSignatures = async (signatures: ConfirmedSignatureInfo[], queriedAddr: PublicKey) => {
  await usingDb(async (db) => {
    await db.insert(schema.signatures).values(signatures.map(tx => ({
      signature: tx.signature,
      slot: tx.slot.toString(),
      didErr: tx.err !== null,
      err: tx.err ? JSON.stringify(tx.err) : null,
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
      }, 30000); //every 30s
    } catch (error) {
      logger.errorWithChatBotAlert([
        error instanceof Error ? 
        `Error in backfill for ${programId.toString()}: ${error.message}` : 
        `Unknown error in backfill for ${programId.toString()}`
      ]);
    }
  }));
}
