import { PublicKey } from "@solana/web3.js";
import { getDBConnection, schema } from "@themetadao/indexer-db";

class TransactionWatcher {
  account: PublicKey;
  description: string;
  latestTxSig: string;
  checkedUpToSlot: bigint;
  public constructor() {

  }
}

export async function startTransactionWatchers() {
  const watchers: Record<string, TransactionWatcher> = {};
  async function getWatchers() {
    const db = await getDBConnection();
    const curWatchers = await db.select().from(schema.transactionWatchers).execute();
    console.log(`total watchers = ${curWatchers.length}`);
  }
  setInterval(() => {
    getWatchers();
  }, 5000);
}