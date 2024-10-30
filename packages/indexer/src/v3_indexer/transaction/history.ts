import { connection } from "../connection";
import { PublicKey } from "@solana/web3.js";
import { logger } from "../logger";

export type TransactionMeta = Awaited<
  ReturnType<(typeof connection)["getSignaturesForAddress"]>
>[number];

function throwInvariantViolation(
  account: PublicKey,
  after: string | undefined,
  before: string | undefined,
  violation: string
) {
  const error = new Error(
    `Invariant violated. account ${account.toBase58()}, after ${after}, before ${before}: ${violation}`
  );
  logger.errorWithChatBotAlert(error.message);
  throw error;
}

export async function getTransactionHistory(
  account: PublicKey,
  largerThanSlot: string,
  range?: { after?: string; before?: string }
): Promise<TransactionMeta[]> {
  const { after, before } = range ?? {};

  const history: TransactionMeta[] = [];

  let earliestSig: string | undefined = before;

  let page = 1;
  while (true) {
    // The Solana RPC tx API has us do a backwards walk
    const transactions = await connection.getSignaturesForAddress(
      account,
      { before: earliestSig },
      "confirmed"
    );
    if (transactions.length === 0) {
      break;
    }
    const sigToIndex = new Map<string, number>();
    let reachedAfter = false;
    for (let i = 0; i < transactions.length; ++i) {
      const cur = transactions[i];
      const prev = transactions[i - 1];
      if (sigToIndex.has(cur.signature)) {
        throwInvariantViolation(
          account,
          after,
          before,
          `duplicate signature ${cur.signature} at indices ${sigToIndex.get(
            cur.signature
          )} and ${i}`
        );
      }
      if (prev !== undefined && cur.slot > prev.slot) {
        // Transactions are assumed to be in time descending order.
        throwInvariantViolation(
          account,
          after,
          before,
          `index ${i - 1} signature ${prev.signature} has slot ${
            prev.slot
          } while index ${i} signature ${cur.signature} has slot ${cur.slot}`
        );
      }
      if (cur.signature === after) {
        reachedAfter = true;
        break;
      }
      // this causes unnecessary loss of txs being indexed,
      // and if we have an indexer who STRICTLY needs everything in order, then we should create a config field
      // on the indexers table that specifies this as being needed or not needed
      // if (cur.slot < largerThanSlot) {
      //   throwInvariantViolation(
      //     account,
      //     after,
      //     before,
      //     `index ${i} signature ${cur.signature} has slot ${cur.slot} which is less than min slot ${largerThanSlot}`
      //   );
      // }
      history.push(cur);
      earliestSig = cur.signature;
    }
    if (earliestSig && sigToIndex.has(earliestSig)) {
      throwInvariantViolation(
        account,
        after,
        before,
        `account contained before value of ${earliestSig}`
      );
    }
    logger.log(
      `page ${page} for ${account.toBase58()} (${history.length} total)`
    );
    page++;
    if (reachedAfter) {
      break;
    }
  }

  history.reverse(); // Now earliest transaction comes first.

  return history;
}
