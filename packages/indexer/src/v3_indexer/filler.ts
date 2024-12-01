import { PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.3";
import { connection } from "../connection";
import { logger } from "../logger";
import { schema, usingDb, eq } from "@metadaoproject/indexer-db";

const INTERVAL_MS = 60_000; // 1 minute

export async function startV3ProgramIndexer() {
  const programIds = [AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID];
  
  for (const programId of programIds) {
    startIndexingForProgram(programId);
  }
}

async function startIndexingForProgram(programId: PublicKey) {
  let isProcessing = false;

  setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const latestSignature = await getLatestProcessedSignature(programId);
      const signatures = await connection.getSignaturesForAddress(
        programId,
        { until: latestSignature ?? undefined },
        'confirmed'
      );

      for (const sig of signatures.reverse()) {
        try {
          let indexer;
          if (programId.equals(AMM_PROGRAM_ID)) {
            indexer = require('./indexers/amm').index;
          } else if (programId.equals(AUTOCRAT_PROGRAM_ID)) {
            indexer = require('./indexers/autocrat').index;
          } else if (programId.equals(CONDITIONAL_VAULT_PROGRAM_ID)) {
            indexer = require('./indexers/conditional_vault').index;
          }

          if (indexer) {
            await indexer(sig.signature);
            await setLatestProcessedSignature(programId, sig.signature);
          }
        } catch (e) {
          logger.error(`Error processing signature ${sig.signature}:`, e);
        }
      }
    } catch (e) {
      logger.errorWithChatBotAlert(`Error in program indexer for ${programId.toString()}:`, e);
    } finally {
      isProcessing = false;
    }
  }, INTERVAL_MS);
}

async function getLatestProcessedSignature(programId: PublicKey): Promise<string | undefined | null> {
  return await usingDb(async (db) => {
    const result = await db
      .select({ signature: schema.indexers.latestTxSigProcessed })
      .from(schema.indexers)
      .where(eq(schema.indexers.name, `v3_${programId.toString()}_indexer`))
      .limit(1);
    return result[0]?.signature;
  });
}

async function setLatestProcessedSignature(programId: PublicKey, signature: string) {
  await usingDb(async (db) => {
    await db
      .update(schema.indexers)
      .set({ latestTxSigProcessed: signature })
      .where(eq(schema.indexers.name, `v3_${programId.toString()}_indexer`));
  });
}  
