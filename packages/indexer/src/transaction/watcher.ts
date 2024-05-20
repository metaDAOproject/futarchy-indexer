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
import {
  TransactionWatchStatus,
  TransactionWatcherTransactionRecord,
} from "@metadaoproject/indexer-db/lib/schema";
import { newTxQueue } from "../indexers/start-transaction-history-indexers";
import { Err, Ok, Result } from "../result";
import { BackgroundJob } from "../background-job";

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
  RollbackUpdateMismatch = "RollbackUpdateMismatch",
  TransactionParseFailure = "TransactionParseFailure",
  StoppedMidBackfill = "StoppedMidBackfill",
  TransactionUpsertFailure = "TransactionUpsertFailure",
  WatcherUpdateFailure = "WatcherUpdateFailure",
}

export type TxWatcherBackfillError =
  | {
      type: WatcherBackfillError.RollbackUpdateMismatch;
      expectedAcct: string;
      actualAcct: string;
    }
  | {
      type: WatcherBackfillError.TransactionParseFailure;
    }
  | {
      type: WatcherBackfillError.StoppedMidBackfill;
    }
  | {
      type: WatcherBackfillError.SlotCheckHistoryMismatch;
      checkedUpToSlot: bigint;
      txSlot: bigint;
      transaction: ConfirmedSignatureInfo;
    }
  | {
      type: WatcherBackfillError.TransactionUpsertFailure;
    }
  | {
      type: WatcherBackfillError.WatcherUpdateFailure;
    }
  | {
      type: WatcherBackfillError.GetTransactionHistoryFailure;
    };

type TransactionWatcherRecord = typeof schema.transactionWatchers._.inferSelect;
type TransactionRecord = typeof schema.transactions._.inferSelect;

export class TransactionWatcher extends BackgroundJob<TxWatcherBackfillError> {
  private acct: string;
  private latestTxSig: string | undefined;
  private checkedUpToSlot: bigint;
  private rpcWebsocket: number | undefined;
  private readonly serializerLogicVersion: number;
  public constructor(record?: TransactionWatcherRecord) {
    if (record === undefined) {
      super();
      this.acct = "";
      this.checkedUpToSlot = BigInt(-1);
      this.serializerLogicVersion = -1;
      return;
    }
    const { acct, latestTxSig, checkedUpToSlot, serializerLogicVersion } =
      record;
    super({
      interval: 10000,
      id: `tx-watcher-${acct}`,
    });
    this.acct = acct;
    this.latestTxSig = latestTxSig ?? undefined;
    this.checkedUpToSlot = checkedUpToSlot;
    this.serializerLogicVersion = serializerLogicVersion;
  }

  public async init(): Promise<Result<true, TxWatcherBackfillError>> {
    if (this.serializerLogicVersion === SERIALIZED_TRANSACTION_LOGIC_VERSION) {
      return Ok(true);
    }
    this.logger.info(
      `resetting. DB's tx schema version of ${this.serializerLogicVersion} doesn't match code's version of ${SERIALIZED_TRANSACTION_LOGIC_VERSION}`
    );
    const updated = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
          latestTxSig: null,
          checkedUpToSlot: BigInt(0),
        })
        .where(eq(schema.transactionWatchers.acct, this.acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updated.length !== 1 || updated[0].acct !== this.acct) {
      return Err({
        type: WatcherBackfillError.RollbackUpdateMismatch,
        expectedAcct: this.acct,
        actualAcct: `len=${updated.length},acct=${updated[0]?.acct}`,
      });
    }
    return Ok(true);
  }

  public async getIntendedJobs(): Promise<this[]> {
    return (
      await usingDb((db) =>
        db.select().from(schema.transactionWatchers).execute()
      )
    ).map((watcher) => new TransactionWatcher(watcher) as this);
  }

  public async doJob(): Promise<Result<true, TxWatcherBackfillError>> {
    const latestFinalizedSlot = BigInt(await connection.getSlot("finalized"));
    const historyResult =
      await this.getTransactionHistoryFromFinalizedSlotWithRetry();
    if (!historyResult.success) {
      // update tx watcher status to failed and exit, but other tx watchers continue
      const markFailedResult = await this.markTransactionWatcherAsFailed(
        historyResult.error.type
      );
      if (!markFailedResult?.success) {
        return markFailedResult;
      }
      return historyResult;
    }
    const history = historyResult.ok;
    this.logger.info(
      `history after ${this.latestTxSig} is length ${history.length}`
    );
    let priorSlot = this.checkedUpToSlot;
    let numIndexed = 0;
    for (const signatureInfo of history) {
      if (this.stopped()) {
        this.logger.error(`Stopped watcher mid backfill`);
        return Err({ type: WatcherBackfillError.StoppedMidBackfill });
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
            .where(eq(schema.transactionWatchers.acct, this.acct))
            .execute()
        )
      )[0];
      const { checkedUpToSlot } = curWatcherRecord;
      // if (slot <= checkedUpToSlot) {
      //   const errorMessage = `supposedly checked up to slot ${checkedUpToSlot} but history returned sig ${signature} with slot ${slot}`;
      //   this.logger.error(errorMessage);
      //   this.stop();
      //   return Err({
      //     type: WatcherBackfillError.SlotCheckHistoryMismatch,
      //     checkedUpToSlot,
      //     txSlot: slot,
      //     transaction: signatureInfo
      //   });
      // }
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
          this.logger.error(
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
          this.logger.error(
            `Failed to upsert ${signature}. ${JSON.stringify(
              transactionRecord
            )}`
          );
          return Err({ type: WatcherBackfillError.TransactionUpsertFailure });
        }
      }
      // TODO: maybe i need to validate below succeeded. I can't use returning because this isn't an upsert so it could
      //       be a no-op in the happy path
      await usingDb((db) =>
        db
          .insert(schema.transactionWatcherTransactions)
          .values({
            txSig: signature,
            slot,
            watcherAcct: this.acct,
          })
          .onConflictDoNothing()
      );
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
            acct: this.acct,
            latestTxSig: signature,
            firstTxSig: curWatcherRecord.firstTxSig ?? signature,
            serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
            checkedUpToSlot: newCheckedUpToSlot,
          })
          .where(eq(schema.transactionWatchers.acct, this.acct))
          .returning({ acct: schema.transactionWatchers.acct })
      );
      if (updateResult.length !== 1 || updateResult[0].acct !== this.acct) {
        this.logger.error(`Failed to update on tx ${signature}`);
        return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
      }
      priorSlot = slot;
      this.checkedUpToSlot = newCheckedUpToSlot;
      numIndexed++;
      if (numIndexed % 50 === 0) {
        this.logger.info(`(${numIndexed} / ${history.length})`);
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
      this.logger.log(`using finalized slot of ${latestFinalizedSlot}`);
    }
    const updateResult = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          checkedUpToSlot: newCheckedUpToSlot,
        })
        .where(eq(schema.transactionWatchers.acct, this.acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updateResult.length !== 1 || updateResult[0].acct !== this.acct) {
      this.logger.error(`Failed to update at end of backfill`);
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    this.checkedUpToSlot = newCheckedUpToSlot;
    return Ok(true);
  }

  private async getTransactionHistoryFromFinalizedSlotWithRetry(): Promise<
    Result<ConfirmedSignatureInfo[], TxWatcherBackfillError>
  > {
    const maxRetries = 3;
    const retryDelay = 1000;
    let maxSignatures = 0;
    let responseWithMaxSignatures: ConfirmedSignatureInfo[] = [];

    for (let i = 0; i < maxRetries; i++) {
      try {
        const txSignatures = await getTransactionHistory(
          new PublicKey(this.acct),
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

  private async markTransactionWatcherAsFailed(
    failureLog: string
  ): Promise<Result<true, TxWatcherBackfillError>> {
    const updateResult = await usingDb((db) =>
      db
        .update(schema.transactionWatchers)
        .set({
          acct: this.acct,
          status: TransactionWatchStatus.Failed,
          failureLog,
          updatedAt: new Date(),
        })
        .where(eq(schema.transactionWatchers.acct, this.acct))
        .returning({ acct: schema.transactionWatchers.acct })
    );
    if (updateResult.length !== 1 || updateResult[0].acct !== this.acct) {
      logger.error(`Failed to mark tx watcher for acct ${this.acct} as failed`);
      return Err({ type: WatcherBackfillError.WatcherUpdateFailure });
    }
    return Ok(true);
  }
}
