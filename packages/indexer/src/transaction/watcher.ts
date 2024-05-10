import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { usingDb, schema, eq } from "@metadaoproject/indexer-db";
import {
  SERIALIZED_TRANSACTION_LOGIC_VERSION,
  Transaction,
  getTransaction,
  serialize,
} from "./serializer";
import { getTransactionHistory } from "./history";
import { connection } from "../connection";
import { logger } from "../logger";
import { Err, Ok, Result, TaggedUnion } from "../match";
import {
  TransactionWatchStatus,
  TransactionWatcherTransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { newTxQueue } from "../indexers/start-transaction-history-indexers";

/*
$ pnpm sql "select table_catalog, table_schema, table_name, column_name, ordinal_position from information_schema.columns where table_schema='public' and table_name='transaction_watchers'"
> @metadaoproject/indexer-db@ sql /workspaces/meta-repo/repos/futarchy-indexer/packages/database
> bun src/run-sql.ts "select table_catalog, table_schema, table_name, column_name, ordinal_position from information_schema.columns where table_schema='public' and table_name='transaction_watchers'"

select table_catalog, table_schema, table_name, column_name, ordinal_position from information_schema.columns where table_schema='public' and table_name='transaction_watchers'
total: 6
table_catalog  table_schema  table_name            column_name               ordinal_position
---------------------------------------------------------------------------------------------
railway        public        transaction_watchers  acct                      1               
railway        public        transaction_watchers  latest_tx_sig             2               
railway        public        transaction_watchers  description               3               
railway        public        transaction_watchers  checked_up_to_slot        4               
railway        public        transaction_watchers  first_tx_sig              5               
railway        public        transaction_watchers  serializer_logic_version  6               
$ pnpm sql "insert into transaction_watchers values ('TWAPrdhADy2aTKN5iFZtNnkQYXERD9NvKjPFVPMSCNN', NULL, 'openbookv2 twap watcher', 0, NULL, 0)"
*/

export enum WatcherBackfillError {
  StoppedBackfill = "StoppedBackfill",
  SlotCheckHistoryMismatch = "SlotCheckHistoryMismatch",
  GetTransactionHistoryFailure = "GetTransactionHistoryFailure",
  TransactionParseFailure = "TransactionParseFailure",
  TransactionUpsertFailure = "TransactionUpsertFailure",
  WatcherUpdateFailure = "WatcherUpdateFailure",
  StartedWithPollingIntervalSet = "StartedWithPollingIntervalSet",
}

type TransactionWatcherRecord = typeof schema.transactionWatchers._.inferSelect;
type TransactionRecord = typeof schema.transactions._.inferInsert;

const watchers: Record<string, TransactionWatcher> = {};

class TransactionWatcher {
  private account: PublicKey;
  private description: string;
  private latestTxSig: string | undefined;
  private checkedUpToSlot: bigint;
  private logicVersion: number;
  private pollerIntervalId: ReturnType<typeof setInterval> | undefined;
  private rpcWebsocket: number | undefined;
  private stopped: boolean;
  private backfilling: boolean;
  public constructor({
    acct,
    description,
    latestTxSig,
    checkedUpToSlot,
    serializerLogicVersion,
  }: TransactionWatcherRecord) {
    this.account = new PublicKey(acct);
    this.description = description;
    this.latestTxSig = latestTxSig ?? undefined;
    this.checkedUpToSlot = checkedUpToSlot;
    this.logicVersion = serializerLogicVersion;
    this.stopped = false;
    this.backfilling = false;
    this.start();
  }

  private async start() {
    if (this.pollerIntervalId !== undefined) {
      logger.error(
        `Interval was ${
          this.pollerIntervalId
        } when starting ${this.account.toBase58()}`
      );
      return Err({ type: WatcherBackfillError.StartedWithPollingIntervalSet });
    }
    await this.handleBackfillFromLatest();
    // TODO: add websocket for realtime updates (might be lossy, but would allow us to increase poll time meaning less rpc costs)
    this.pollerIntervalId = setInterval(async () => {
      await this.handleBackfillFromLatest();
    }, 10000);
    return Ok(`successfully started watcher for ${this.account.toBase58()}`);
  }

  private async handleBackfillFromLatest() {
    const backfillRes = await this.backfillFromLatest();
    switch (backfillRes.success) {
      case true:
        {
          if (this.account) {
            logger.info(
              `successfully ran backfill for acct: ${this.account.toBase58()}`
            );
          }
          logger.info(`success message: ${backfillRes.ok}`);
        }
        break;
      case false:
        {
          logger.error(
            `error running backfill from latest: ${
              backfillRes.error.type
            }. For acct: ${this.account.toBase58()}`
          );
        }
        break;
    }
  }

  private async backfillFromLatest(): Promise<
    | {
        success: false;
        error: TaggedUnion;
      }
    | {
        success: true;
        ok: string;
      }
  > {
    if (this.stopped)
      return Ok("tried to call backfillFromLatest a stopped watcher");
    if (this.backfilling)
      return Ok(
        "tried to call backfillFromLatest on an already backfilling watcher"
      );
    this.backfilling = true;
    const acct = this.account.toBase58();
    const latestFinalizedSlot = BigInt(await connection.getSlot("finalized"));
    const historyRes =
      await this.getTransactionHistoryFromFinalizedSlotWithRetry();
    if (!historyRes.success) {
      // update tx watcher status to failed and exit, but other tx watchers continue
      const markFailedResult = await this.markTransactionWatcherAsFailed();
      if (!markFailedResult?.success) {
        return markFailedResult;
      }
      return historyRes;
    }
    // history fetch was successful
    const history = historyRes.ok;
    logger.info(
      `history after ${this.latestTxSig} is length ${history.length}`
    );
    let numIndexed = 0;
    for (const signatureInfo of history) {
      const res = await this.processTransactionInHistory(
        acct,
        signatureInfo,
        numIndexed,
        history
      );
      if (!res.success) {
        console.error(
          "error processing transaction",
          res.error,
          signatureInfo.signature,
          acct
        );
      }
    }
    // Update checkedUpToSlot to latest confirmed slot. If we don't do this, then checkedUpToSlot would only be updated once there's a new
    // transaction, and this would mean indexers would stall in cases where some of the dependent watchers don't have frequent transactions.
    // It's possible that this might be the source of bugs if somehow new transactions come in that are before the latest confirmed slot but were
    // not returned by the RPC's tx history.
    // EDIT: encountered above bug so trying to resolve by switching to finalized slot rather than confirmed.
    // EDIT: even switching to finalized didn't really work. This logic needs rethinking
    const newCheckedUpToSlot =
      this.checkedUpToSlot > latestFinalizedSlot
        ? this.checkedUpToSlot
        : latestFinalizedSlot;
    if (newCheckedUpToSlot === latestFinalizedSlot) {
      console.log(
        `For acct ${acct}, using finalized slot of ${latestFinalizedSlot}`
      );
    }
    const updateResult = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          checkedUpToSlot: newCheckedUpToSlot,
        })
        .where(eq(schema.transactionWatchers.acct, acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
      logger.error(
        `Failed to update tx watcher for acct ${acct} at end of backfill`
      );
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    this.checkedUpToSlot = newCheckedUpToSlot;
    this.backfilling = false;
    return Ok(`${acct} watcher is up to date`);
  }

  private async processTransactionInHistory(
    acct: string,
    signatureInfo: ConfirmedSignatureInfo,
    numIndexed: number,
    history: ConfirmedSignatureInfo[]
  ): Promise<
    | {
        success: true;
        ok: { priorSlot: bigint; numIndexed: number };
      }
    | {
        success: false;
        error: TaggedUnion;
      }
  > {
    const priorSlot = this.checkedUpToSlot;
    if (this.stopped) {
      logger.error(`Stopped watcher for ${acct} mid backfill`);
      return Err({ type: WatcherBackfillError.StoppedBackfill });
    }
    const { slot: slotAsNum, signature } = signatureInfo;
    const slot = BigInt(slotAsNum);
    // TODO: lock should be done here. It's probably fine for now since we only have 1 instance.
    //       I can think of weird states though where you have this stopped watcher and another started one.
    // Leaving as todo since optimistic locking might be preferred
    const curWatcherRecord = (
      await usingDb((db) =>
        db
          .select()
          .from(schema.transactionWatchers)
          .where(eq(schema.transactionWatchers.acct, acct))
          .execute()
      )
    )[0];
    const { checkedUpToSlot } = curWatcherRecord;
    if (slot <= checkedUpToSlot) {
      const errorMessage = `watcher for account ${acct} supposedly checked up to slot ${checkedUpToSlot} but history returned sig ${signature} with slot ${slot}`;
      logger.error(errorMessage);
      this.stop();
      return Err({ type: WatcherBackfillError.SlotCheckHistoryMismatch });
    }
    const maybeCurTxRecord = await usingDb((db) =>
      db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.txSig, signature))
        .execute()
    );
    if (
      maybeCurTxRecord.length === 0 ||
      maybeCurTxRecord[0].serializerLogicVersion <
        SERIALIZED_TRANSACTION_LOGIC_VERSION
    ) {
      const parseTxResult = await getTransaction(signature);
      if (!parseTxResult.success) {
        logger.error(
          `Failed to parse tx ${signature}\n` +
            JSON.stringify(parseTxResult.error)
        );
        this.stop();
        return Err({ type: WatcherBackfillError.TransactionParseFailure });
      }
      const { ok: serializableTx } = parseTxResult;
      const res = await handleNewTransaction(
        signature,
        slot,
        serializableTx,
        acct
      );
      if (res && !res?.success) {
        return Err({ type: res.error.type });
      }
    }

    // We could opt to only update slot at end, but updating it now means indexers can progress while a backfill is in progress.
    // That's preferrable since the backfill could be a lot of transactions and it could stall if there are any bugs in the tx backup logic
    // We can't set the checked up to slot as the current tx's slot, since there might be a tx after this one on the same slot. So we instead
    // need to set it to the prior tx's slot if that slot is less than the current slot.
    const newCheckedUpToSlot =
      slot > priorSlot ? priorSlot : this.checkedUpToSlot;
    const updateResult = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          acct,
          latestTxSig: signature,
          firstTxSig: curWatcherRecord.firstTxSig ?? signature,
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
          checkedUpToSlot: newCheckedUpToSlot,
        })
        .where(eq(schema.transactionWatchers.acct, acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
      logger.error(
        `Failed to update tx watcher for acct ${acct} on tx ${signature}`
      );
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    this.checkedUpToSlot = newCheckedUpToSlot;
    numIndexed++;
    if (numIndexed % 50 === 0) {
      logger.info(`(${numIndexed} / ${history.length}) ${acct} watcher`);
    }

    return Ok({ priorSlot: slot, numIndexed });
  }

  private async getTransactionHistoryFromFinalizedSlotWithRetry(): Promise<
    Result<ConfirmedSignatureInfo[], TaggedUnion>
  > {
    const maxRetries = 3;
    const retryDelay = 1000;
    let maxSignatures = 0;
    let responseWithMaxSignatures: ConfirmedSignatureInfo[] = [];

    for (let i = 0; i < maxRetries; i++) {
      try {
        const txSignatures = await getTransactionHistory(
          this.account,
          this.checkedUpToSlot,
          { after: this.latestTxSig }
        );

        if (txSignatures.length > maxSignatures) {
          maxSignatures = txSignatures.length;
          responseWithMaxSignatures = txSignatures;
        }

        if (i > 0 && txSignatures.length !== maxSignatures) {
          console.log(
            "Difference noticed in tx count during getTransactionHistory RPC call attempts. New length is",
            txSignatures.length,
            " vs previous length is",
            maxSignatures
          );
        }
      } catch (error) {
        if (i === maxRetries - 1)
          return Err({
            type: WatcherBackfillError.GetTransactionHistoryFailure,
          });
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    // Return the response with the max signatures after all retries
    return Ok(responseWithMaxSignatures);
  }

  private async markTransactionWatcherAsFailed() {
    const acct = this.account.toBase58();
    const updateResult = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          acct,
          status: TransactionWatchStatus.Failed,
        })
        .where(eq(schema.transactionWatchers.acct, acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
      logger.error(`Failed to mark tx watcher for acct ${acct} as failed`);
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    return Ok("successfully marked transaction watcher as failed");
  }

  public stop() {
    this.stopped = true;
    if (this.pollerIntervalId === undefined) {
      logger.warn(
        `Interval was ${
          this.pollerIntervalId
        } when stopping ${this.account.toBase58()}`
      );
    }
    clearInterval(this.pollerIntervalId);
    this.pollerIntervalId = undefined;
  }
}

let updatingWatchers = false;

async function handleNewTransaction(
  signature: string,
  slot: bigint,
  parsedTx: Transaction,
  acct: string
) {
  const transactionRecord: TransactionRecord = {
    txSig: signature,
    slot,
    blockTime: new Date(parsedTx.blockTime * 1000), // TODO need to verify if this is correct
    failed: parsedTx.err !== undefined,
    payload: serialize(parsedTx),
    serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
  };
  const upsertResult = await usingDb((db) =>
    db
      .insert(schema.transactions)
      .values(transactionRecord)
      .onConflictDoUpdate({
        target: schema.transactions.txSig,
        set: transactionRecord,
      })
      .returning({ txSig: schema.transactions.txSig })
  );
  if (upsertResult.length !== 1 || upsertResult[0].txSig !== signature) {
    logger.error(
      `Failed to upsert ${signature}. ${JSON.stringify(transactionRecord)}`
    );
    return Err({ type: WatcherBackfillError.TransactionUpsertFailure });
  }

  // TODO: maybe i need to validate below succeeded. I can't use returning because this isn't an upsert so it could
  //       be a no-op in the happy path
  const watcherTxRecord: TransactionWatcherTransactionRecord = {
    txSig: signature,
    slot,
    watcherAcct: acct,
  };
  const insertRes = await usingDb((db) =>
    db
      .insert(schema.transactionWatcherTransactions)
      .values(watcherTxRecord)
      .onConflictDoNothing()
      .returning({ acct: schema.transactionWatcherTransactions.watcherAcct })
  );
  if (insertRes.length > 0) {
    console.log("successfully inserted new t watch tx", insertRes[0].acct);
  }

  // now insert into queue
  await newTxQueue.push({
    transactions: transactionRecord,
    transaction_watcher_transactions: watcherTxRecord,
  });
}

export async function startTransactionWatchers() {
  async function getWatchers() {
    updatingWatchers = true;
    const curWatchers = await usingDb((db) =>
      db.select().from(schema.transactionWatchers).execute()
    );
    const curWatchersByAccount: Record<string, TransactionWatcherRecord> = {};
    const watchersToStart: Set<string> = new Set();
    const watchersToStop: Set<string> = new Set();
    // TODO: we need a way to reset running watchers if they're slot or tx was rolled back
    for (const watcherInDb of curWatchers) {
      curWatchersByAccount[watcherInDb.acct] = watcherInDb;
      const alreadyWatching = watcherInDb.acct in watchers;
      if (!alreadyWatching) {
        watchersToStart.add(watcherInDb.acct);
      } else {
        if (
          watcherInDb.serializerLogicVersion !==
          SERIALIZED_TRANSACTION_LOGIC_VERSION
        ) {
          const { acct, serializerLogicVersion } = watcherInDb;
          logger.info(
            `reseting ${acct}. existing logic version of ${serializerLogicVersion} current is ${SERIALIZED_TRANSACTION_LOGIC_VERSION}`
          );
          watchers[acct]?.stop();
          delete watchers[acct];
          const updated = await usingDb((db) =>
            db
              .update(schema.transactionWatchers)
              .set({
                serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
                latestTxSig: null,
                checkedUpToSlot: BigInt(0),
              })
              .where(eq(schema.transactionWatchers.acct, acct))
              .returning({ acct: schema.transactionWatchers.acct })
          );
          if (updated.length !== 1 || updated[0].acct !== acct) {
            const error = new Error(
              `Failed to update ${acct} watcher. ${JSON.stringify(updated)}`
            );
            logger.error(error.message);
            throw error;
          }
        }
      }
    }
    for (const runningWatcherAccount in watchers) {
      if (!(runningWatcherAccount in curWatchersByAccount)) {
        watchersToStop.add(runningWatcherAccount);
      }
    }
    if (watchersToStop.size) {
      logger.info(`Stopping ${watchersToStop.size} watchers:`);
      let i = 0;
      for (const watcherToStopAcct of watchersToStop) {
        logger.info(` ${++i}. ${watcherToStopAcct}`);
        watchers[watcherToStopAcct]?.stop();
        delete watchers[watcherToStopAcct];
      }
    }
    if (watchersToStart.size) {
      logger.info(`Starting ${watchersToStart.size} watchers:`);
      let i = 0;
      for (const watcherToStartAcct of watchersToStart) {
        const prefix = ` ${++i}. `;
        logger.info(`${prefix}${watcherToStartAcct}`);
        const cur = curWatchersByAccount[watcherToStartAcct];
        watchers[watcherToStartAcct] = new TransactionWatcher(cur);
      }
    }
    updatingWatchers = false;
  }
  setInterval(() => {
    if (!updatingWatchers) {
      getWatchers();
    }
  }, 5000);
  getWatchers();
}
