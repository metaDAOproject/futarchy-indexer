import { PublicKey } from "@solana/web3.js";
import { getTransactionHistory } from "../../transaction/history";
import { selectAccount } from "./common/select-account";
import { usingDb, schema, desc, count, lte } from "@metadaoproject/indexer-db";
import { logger } from "../../logger";

export async function validate() {
  const account = await selectAccount();
  const accountPk = new PublicKey(account);
  // First we start by simply validating the counts
  const latestTxResult =
    (await usingDb((db) =>
      db
        .select()
        .from(schema.transactionWatcherTransactions)
        .orderBy(desc(schema.transactionWatcherTransactions.slot))
        .limit(1)
    )) ?? [];
  const [latestTx] = latestTxResult;
  if (!latestTx) {
    logger.log(`No latest transaction for account ${account}`);
    return;
  }
  const txCount =
    (await usingDb((db) =>
      db
        .select({ count: count() })
        .from(schema.transactionWatcherTransactions)
        .where(lte(schema.transactionWatcherTransactions.slot, latestTx.slot))
    )) ?? [];
  const totalCached = txCount[0].count;
  logger.log(`Cached: ${totalCached} for ${account}`);
  const history = await getTransactionHistory(accountPk, BigInt(0), {
    before: latestTx.txSig,
  });
  const totalFromHistory = history.length + 1; // +1 for the latest tx sig
  logger.log(`History: ${totalFromHistory}`);
  logger.log(totalFromHistory === totalCached ? "Match" : `No match`);
  // TODO: go through history and cached and find missing ones
}
