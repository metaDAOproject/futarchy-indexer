import { connection } from '../connection';
import { PublicKey } from '@solana/web3.js';
import { get, set } from '../local-cache';

export type TransactionMeta = Awaited<ReturnType<typeof connection['getSignaturesForAddress']>>[number];

function txToString(tx: TransactionMeta): string {
  return JSON.stringify(tx);
}

function txFromString(str: string): TransactionMeta {
  return JSON.parse(str);
}

export async function getTransactionHistory(account: PublicKey, range?: {before?: string; after?: string;}): Promise<TransactionMeta[]> {
  const {before, after} = range ?? {};
  const cacheKey = ['transactions', account.toBase58()];
  const cachedAccount = await get(cacheKey);
  if (cachedAccount !== undefined) {
    return cachedAccount.map(txFromString);
  }
  let latestTime: number | undefined;
  let earliestTime: number | undefined;
  let earliestSig: string | undefined;
  const history: TransactionMeta[] = [];
  while(true) {
    // The Solana RPC tx API has us do a backwards walk
    const transactions = await connection.getSignaturesForAddress(account, {before: earliestSig});
    if (transactions.length === 0) {
      break;
    }
    let largestSlotIndex = 0;
    let smallestSlotIndex = 0;
    for (let i = 0; i < transactions.length; ++i) {
      const cur = transactions[i];
      if (cur.slot > transactions[largestSlotIndex].slot) largestSlotIndex = i;
      if (cur.slot < transactions[smallestSlotIndex].slot) smallestSlotIndex = i;
    }
    earliestTime = transactions[smallestSlotIndex].blockTime!;
    earliestSig = transactions[smallestSlotIndex].signature;
    latestTime = transactions[largestSlotIndex].blockTime!;
    history.push(...transactions);
  }
  history.reverse(); // Now earliest transaction comes first.
  
  // TODO: validate that initial transaction includes the creation of the account
  const firstTx = history[0];
  if (firstTx === undefined) {
    throw new Error(`No history exists for account ${account.toBase58()}`);
  }
  

  set(cacheKey, history.map(txToString));
  return history;
}
