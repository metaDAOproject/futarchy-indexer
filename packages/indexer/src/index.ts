import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import { CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { usingDb, schema, eq, asc, desc } from "@metadaoproject/indexer-db";

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

const connection = new Connection(RPC_ENDPOINT);


// it's possible that there are signatures BEFORE the oldest signature
// because the indexer may not have been running when those signatures were created

// it's also possible that there are signatures AFTER the newest signature

// we assume that there aren't signatures between the oldest and newest signatures

// we split these into two functions:
// - backfillHistoricalSignatures
// - insertNewSignatures

const backfillHistoricalSignatures = async (
  programId: PublicKey,
  oldestSignature: string | undefined,
) => {
  let backfilledSignatures: ConfirmedSignatureInfo[] = [];

  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { before: oldestSignature, limit: 1000 },
      "finalized"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures);

    backfilledSignatures = backfilledSignatures.concat(signatures);
    oldestSignature = signatures[signatures.length - 1].signature;

    console.log(`backfilled ${backfilledSignatures.length} historical signatures so far...`);
  }

  console.log(`now done backfilling. backfilled ${backfilledSignatures.length} historical signatures`);

  return backfilledSignatures;
};

const insertNewSignatures = async (programId: PublicKey, latestRecordedSignature: string | undefined) => {
  let allSignatures: ConfirmedSignatureInfo[] = [];
  let oldestNewSignatureRecorded: string | undefined;

  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { limit: 1000, until: latestRecordedSignature, before: oldestNewSignatureRecorded },
      "finalized"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures);

    allSignatures = allSignatures.concat(signatures);
    oldestNewSignatureRecorded = signatures[signatures.length - 1].signature;
  }

  return allSignatures;
}

const insertSignatures = async (signatures: ConfirmedSignatureInfo[]) => {
  await usingDb(async (db) => {
    await db.insert(schema.signatures).values(signatures.map(tx => ({
      signature: tx.signature,
      slot: BigInt(tx.slot),
      didErr: tx.err !== null,
      err: tx.err ? JSON.stringify(tx.err) : null,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    }))).onConflictDoNothing().execute();
  });
}

const main = async () => {
  const oldestSignature = await usingDb(async (db) => {
    // TODO use an index on slot or some other performance optimization
    return await db.select({ signature: schema.signatures.signature })
      .from(schema.signatures)
      .orderBy(asc(schema.signatures.slot))
      .limit(1)
      .then(signatures => signatures[0] ? signatures[0].signature : undefined);
  });

  const backfilledSignatures = await backfillHistoricalSignatures(CONDITIONAL_VAULT_PROGRAM_ID, oldestSignature);
  console.log(`backfilled ${backfilledSignatures.length} signatures`);

  setInterval(async () => {
    const recentSignature = await usingDb(async (db) => {
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

    const newSignatures = await insertNewSignatures(CONDITIONAL_VAULT_PROGRAM_ID, recentSignature);

    console.log(`inserted up to ${newSignatures.length} new signatures`);
  }, 1000);
};

main();

