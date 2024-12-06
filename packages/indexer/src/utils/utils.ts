import { schema, usingDb, eq } from "@metadaoproject/indexer-db";
import { PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js";
import { rpc } from "../rpc-wrapper";

//get latestTxSigProcessed
export async function getLatestTxSigProcessed(indexerName: string) {
  return await usingDb(async (db) => {
    return await db.select({ signature: schema.indexers.latestTxSigProcessed })
      .from(schema.indexers)
      .where(eq(schema.indexers.name, indexerName))
      .then(signatures => signatures[0] ? signatures[0].signature as string : undefined);
  });
}

//set latestTxSigProcessed
export async function setLatestTxSigProcessed(signature: string, indexerName: string) {
  await usingDb(async (db) => {
    await db.update(schema.indexers).set({ latestTxSigProcessed: signature }).where(eq(schema.indexers.name, indexerName)).execute();
  });
}

//set latestProcessedSlot in db
export async function setLatestProcessedSlot(slot: number, indexerName: string) {
  return await usingDb(async (db) => {
    await db.update(schema.indexers)
      .set({ latestSlotProcessed: slot.toString() })
      .where(eq(schema.indexers.name, indexerName))
      .execute();
  });
}

//get latestProcessedSlot from db
export async function getLatestProcessedSlot(indexerName: string) {
  return await usingDb(async (db) => {
    return await db.select({ slot: schema.indexers.latestSlotProcessed })
      .from(schema.indexers)
      .where(eq(schema.indexers.name, indexerName))
      .then(slots => slots[0] ? slots[0].slot : undefined);
  });
}

export const getNewSignatures = async (programId: PublicKey, indexerName: string) => {
  let allSignatures: ConfirmedSignatureInfo[] = [];
  //get latest signature from db indexers table latestTxSigProcessed
  let latestRecordedSignature = await getLatestTxSigProcessed(indexerName);

  //TODO: this should never happen in theory so im commenting it out for now
  // if (!latestRecordedSignature) {
  //   //fallback just in case
  //   latestRecordedSignature = await usingDb(async (db) => {
  //     return await db.select({ signature: schema.signatures.signature, slot: schema.signatures.slot })
  //       .from(schema.signatures)
  //       .orderBy(desc(schema.signatures.slot))
  //       .limit(1)
  //       .then(signatures => {
  //         if (signatures.length === 0) return undefined;
  //         return signatures[0].signature;
  //       });
  //   });
  // }

  // console.log(`insertNewSignatures::latestRecordedSignature: ${latestRecordedSignature}`);

  let oldestSignatureInserted: string | undefined;
  while (true) {
    const signatures = await rpc.call(
      "getSignaturesForAddress",
      [programId, { limit: 1000, until: latestRecordedSignature, before: oldestSignatureInserted }, "confirmed"],
      "Get new signatures"
    ) as ConfirmedSignatureInfo[];

    if (signatures.length === 0) break;

    allSignatures = allSignatures.concat(signatures);
    if (!oldestSignatureInserted) setLatestTxSigProcessed(signatures[0].signature, indexerName); //since getSignaturesForAddress is a backwards walk, this should be the latest signature
    oldestSignatureInserted = signatures[signatures.length - 1].signature;
  }

  return allSignatures;
}