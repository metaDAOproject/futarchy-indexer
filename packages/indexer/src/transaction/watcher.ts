import { PublicKey } from "@solana/web3.js";
import { getDBConnection, schema, eq } from "@themetadao/indexer-db";
import {
  SERIALIZED_TRANSACTION_LOGIC_VERSION,
  getTransaction,
  serialize,
} from "./serializer";
import { getTransactionHistory } from "./history";
import { connection } from "../connection";
import { logger } from "../logger";
import { Err, Ok, TaggedUnion } from "../match";

/*
$ pnpm sql "select table_catalog, table_schema, table_name, column_name, ordinal_position from information_schema.columns where table_schema='public' and table_name='transaction_watchers'"
> @themetadao/indexer-db@ sql /workspaces/meta-repo/repos/futarchy-indexer/packages/database
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
  TransactionParseFailure = "TransactionParseFailure",
  TransactionUpsertFailure = "TransactionUpsertFailure",
  WatcherUpdateFailure = "WatcherUpdateFailure",
  StartedWithPollingIntervalSet = "StartedWithPollingIntervalSet",
}

type TransactionWatcherRecord =
  typeof schema.transactionWatchers._.model.select;
type TransactionRecord = typeof schema.transactions._.model.insert;

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
            `error running backfill from latest: ${backfillRes.error.type}`
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
    const latestFinalizedSlot = BigInt(await connection.getSlot("finalized"));
    const history = await getTransactionHistory(
      this.account,
      this.checkedUpToSlot,
      { after: this.latestTxSig }
    );
    logger.info(
      `history after ${this.latestTxSig} is length ${history.length}`
    );
    const db = await getDBConnection();
    const acct = this.account.toBase58();
    let priorSlot = this.checkedUpToSlot;
    let numIndexed = 0;
    for (const signatureInfo of history) {
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
        await db.con
          .select()
          .from(schema.transactionWatchers)
          .where(eq(schema.transactionWatchers.acct, acct))
          .execute()
      )[0];
      const { checkedUpToSlot } = curWatcherRecord;
      if (slot <= checkedUpToSlot) {
        const errorMessage = `watcher for account ${acct} supposedly checked up to slot ${checkedUpToSlot} but history returned sig ${signature} with slot ${slot}`;
        logger.error(errorMessage);
        this.stop();
        return Err({ type: WatcherBackfillError.SlotCheckHistoryMismatch });
      }
      const maybeCurTxRecord = await db.con
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.txSig, signature))
        .execute();
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
        const transactionRecord: TransactionRecord = {
          txSig: signature,
          slot,
          blockTime: new Date(serializableTx.blockTime * 1000), // TODO need to verify if this is correct
          failed: serializableTx.err !== undefined,
          payload: serialize(parseTxResult.ok),
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
        };
        const upsertResult = await db.con
          .insert(schema.transactions)
          .values(transactionRecord)
          .onConflictDoUpdate({
            target: schema.transactions.txSig,
            set: transactionRecord,
          })
          .returning({ txSig: schema.transactions.txSig });
        if (upsertResult.length !== 1 || upsertResult[0].txSig !== signature) {
          logger.error(
            `Failed to upsert ${signature}. ${JSON.stringify(
              transactionRecord
            )}`
          );
          return Err({ type: WatcherBackfillError.TransactionUpsertFailure });
        }
      }
      // TODO: maybe i need to validate below succeeded. I can't use returning because this isn't an upsert so it could
      //       be a no-op in the happy path
      await db.con
        .insert(schema.transactionWatcherTransactions)
        .values({
          txSig: signature,
          slot,
          watcherAcct: acct,
        })
        .onConflictDoNothing();
      // We could opt to only update slot at end, but updating it now means indexers can progress while a backfill is in progress.
      // That's preferrable since the backfill could be a lot of transactions and it could stall if there are any bugs in the tx backup logic
      // We can't set the checked up to slot as the current tx's slot, since there might be a tx after this one on the same slot. So we instead
      // need to set it to the prior tx's slot if that slot is less than the current slot.
      const newCheckedUpToSlot =
        slot > priorSlot ? priorSlot : this.checkedUpToSlot;
      const updateResult = await db.con
        .update(schema.transactionWatchers)
        .set({
          acct,
          latestTxSig: signature,
          firstTxSig: curWatcherRecord.firstTxSig ?? signature,
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
          checkedUpToSlot: newCheckedUpToSlot,
        })
        .where(eq(schema.transactionWatchers.acct, acct))
        .returning({ acct: schema.transactionWatchers.acct });
      if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
        logger.error(
          `Failed to update tx watcher for acct ${acct} on tx ${signature}`
        );
        return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
      }
      priorSlot = slot;
      this.checkedUpToSlot = newCheckedUpToSlot;
      numIndexed++;
      if (numIndexed % 50 === 0) {
        logger.info(`(${numIndexed} / ${history.length}) ${acct} watcher`);
      }
    }
    // Update checkedUpToSlot to latest confirmed slot. If we don't do this, then checkedUpToSlot would only be updated once there's a new
    // transaction, and this would mean indexers would stall in cases where some of the dependent watchers don't have frequent transactions.
    // It's possible that this might be the source of bugs if somehow new transactions come in that are before the latest confirmed slot but were
    // not returned by the RPC's tx history.
    // EDIT: encountered above bug so trying to resolve by switching to finalized slot rather than confirmed.
    const newCheckedUpToSlot =
      this.checkedUpToSlot > latestFinalizedSlot
        ? this.checkedUpToSlot
        : latestFinalizedSlot;
    if (newCheckedUpToSlot === latestFinalizedSlot) {
      console.log(
        `For acct ${acct}, using finalized slot of ${latestFinalizedSlot}`
      );
    }
    const updateResult = await db.con
      .update(schema.transactionWatchers)
      .set({
        checkedUpToSlot: newCheckedUpToSlot,
      })
      .where(eq(schema.transactionWatchers.acct, acct))
      .returning({ acct: schema.transactionWatchers.acct });
    if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
      logger.error(
        `Failed to update tx watcher for acct ${acct} at end of backfill`
      );
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    this.checkedUpToSlot = newCheckedUpToSlot;

    db.client.release();
    this.backfilling = false;
    return Ok(`${acct} watcher is up to date`);
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

export async function startTransactionWatchers() {
  async function getWatchers() {
    updatingWatchers = true;
    const db = await getDBConnection();
    try {
      const curWatchers = await db.con
        .select()
        .from(schema.transactionWatchers)
        .execute();
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
            const updated = await db.con
              .update(schema.transactionWatchers)
              .set({
                serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
                latestTxSig: null,
                checkedUpToSlot: BigInt(0),
              })
              .where(eq(schema.transactionWatchers.acct, acct))
              .returning({ acct: schema.transactionWatchers.acct });
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
    } finally {
      db.client.release();
    }
  }
  setInterval(() => {
    if (!updatingWatchers) {
      getWatchers();
    }
  }, 5000);
  getWatchers();
}
