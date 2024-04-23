import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { usingDb, schema, eq } from "@metadaoproject/indexer-db";
import {
  SERIALIZED_TRANSACTION_LOGIC_VERSION,
  getTransaction,
  serialize,
} from "./serializer";
import { getTransactionHistory } from "./history";
import { connection } from "../connection";
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

export enum TxWatcherBackfillErrorType {
  RollbackUpdateMismatch = "RollbackUpdateMismatch",
  TransactionParseFailure = "TransactionParseFailure",
  StoppedMidBackfill = "StoppedMidBackfill",
  SlotCheckHistoryMismatch = "SlotCheckHistoryMismatch",
  TransactionUpsertFailure = "TransactionUpsertFailure",
  WatcherUpdateFailure = "WatcherUpdateFailure",
}

export type TxWatcherBackfillError = 
  {
    type: TxWatcherBackfillErrorType.RollbackUpdateMismatch;
    expectedAcct: string;
    actualAcct: string;
  } |
  {
    type: TxWatcherBackfillErrorType.TransactionParseFailure;
  } |
  {
    type: TxWatcherBackfillErrorType.StoppedMidBackfill;
  } |
  {
    type: TxWatcherBackfillErrorType.SlotCheckHistoryMismatch;
    checkedUpToSlot: bigint;
    txSlot: bigint;
    transaction: ConfirmedSignatureInfo;
  } |
  {
    type: TxWatcherBackfillErrorType.TransactionUpsertFailure;

  } |
  {
    type: TxWatcherBackfillErrorType.WatcherUpdateFailure;
  };

type TransactionWatcherRecord =
  typeof schema.transactionWatchers._.inferSelect;
type TransactionRecord = 
  typeof schema.transactions._.inferSelect;

export class TransactionWatcher extends BackgroundJob<TxWatcherBackfillError> {
  private acct: string;
  private latestTxSig: string | undefined;
  private checkedUpToSlot: bigint;
  private rpcWebsocket: number | undefined;
  private readonly serializerLogicVersion: number;
  public constructor(record?: TransactionWatcherRecord) {
    if (record === undefined) {
      super();
      this.acct = '';
      this.checkedUpToSlot = BigInt(-1);
      this.serializerLogicVersion = -1;
      return;
    }
    const {acct, latestTxSig, checkedUpToSlot, serializerLogicVersion} = record;
    super({
      interval: 10000,
      id: `tx-watcher-${acct}`
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
      `resetting. DB's tx schema version of ${
        this.serializerLogicVersion
      } doesn't match code's version of ${
        SERIALIZED_TRANSACTION_LOGIC_VERSION}`);
    const updated = await usingDb(db => db
      .update(schema.transactionWatchers)
      .set({
        serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
        latestTxSig: null,
        checkedUpToSlot: BigInt(0),
      })
      .where(eq(schema.transactionWatchers.acct, this.acct))
      .returning({ acct: schema.transactionWatchers.acct }));
    if (updated.length !== 1 || updated[0].acct !== this.acct) {
      return Err({
        type: TxWatcherBackfillErrorType.RollbackUpdateMismatch,
        expectedAcct: this.acct,
        actualAcct: `len=${updated.length},acct=${updated[0]?.acct}`
      });
    }
    return Ok(true);
  }

  public async getIntendedJobs(): Promise<this[]> {
    return (await usingDb(db => db
      .select()
      .from(schema.transactionWatchers)
      .execute()))
      .map(watcher => new TransactionWatcher(watcher) as this);
  }

  public async doJob(): Promise<Result<true, TxWatcherBackfillError>> {
    const latestFinalizedSlot = BigInt(await connection.getSlot("finalized"));
    const history = await getTransactionHistory(
      new PublicKey(this.acct),
      this.checkedUpToSlot,
      { after: this.latestTxSig }
    );
    this.logger.info(
      `history after ${this.latestTxSig} is length ${history.length}`
    );
    let priorSlot = this.checkedUpToSlot;
    let numIndexed = 0;
    for (const signatureInfo of history) {
      if (this.stopped()) {
        this.logger.error(`Stopped watcher mid backfill`);
        return Err({ type: TxWatcherBackfillErrorType.StoppedMidBackfill });
      }
      const { slot: slotAsNum, signature } = signatureInfo;
      const slot = BigInt(slotAsNum);
      // TODO: lock should be done here. It's probably fine for now since we only have 1 instance.
      //       I can think of weird states though where you have this stopped watcher and another started one.
      // Leaving as todo since optimistic locking might be preferred
      const curWatcherRecord = (
        await usingDb(db => db
          .select()
          .from(schema.transactionWatchers)
          .where(eq(schema.transactionWatchers.acct, this.acct))
          .execute())
      )[0];
      const { checkedUpToSlot } = curWatcherRecord;
      if (slot <= checkedUpToSlot) {
        const errorMessage = `supposedly checked up to slot ${checkedUpToSlot} but history returned sig ${signature} with slot ${slot}`;
        this.logger.error(errorMessage);
        this.stop();
        return Err({ 
          type: TxWatcherBackfillErrorType.SlotCheckHistoryMismatch,
          checkedUpToSlot,
          txSlot: slot,
          transaction: signatureInfo
        });
      }
      const maybeCurTxRecord = await usingDb(db => db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.txSig, signature))
        .execute());
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
          return Err({ type: TxWatcherBackfillErrorType.TransactionParseFailure });
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
        const upsertResult = await usingDb(db => db
          .insert(schema.transactions)
          .values(transactionRecord)
          .onConflictDoUpdate({
            target: schema.transactions.txSig,
            set: transactionRecord,
          })
          .returning({ txSig: schema.transactions.txSig }));
        if (upsertResult.length !== 1 || upsertResult[0].txSig !== signature) {
          this.logger.error(
            `Failed to upsert ${signature}. ${JSON.stringify(
              transactionRecord
            )}`
          );
          return Err({ type: TxWatcherBackfillErrorType.TransactionUpsertFailure });
        }
      }
      // TODO: maybe i need to validate below succeeded. I can't use returning because this isn't an upsert so it could
      //       be a no-op in the happy path
      await usingDb(db => db
        .insert(schema.transactionWatcherTransactions)
        .values({
          txSig: signature,
          slot,
          watcherAcct: this.acct,
        })
        .onConflictDoNothing());
      // We could opt to only update slot at end, but updating it now means indexers can progress while a backfill is in progress.
      // That's preferrable since the backfill could be a lot of transactions and it could stall if there are any bugs in the tx backup logic
      // We can't set the checked up to slot as the current tx's slot, since there might be a tx after this one on the same slot. So we instead
      // need to set it to the prior tx's slot if that slot is less than the current slot.
      const newCheckedUpToSlot =
        slot > priorSlot ? priorSlot : this.checkedUpToSlot;
      const updateResult = await usingDb(db => db
        .update(schema.transactionWatchers)
        .set({
          acct: this.acct,
          latestTxSig: signature,
          firstTxSig: curWatcherRecord.firstTxSig ?? signature,
          serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
          checkedUpToSlot: newCheckedUpToSlot,
        })
        .where(eq(schema.transactionWatchers.acct, this.acct))
        .returning({ acct: schema.transactionWatchers.acct }));
      if (updateResult.length !== 1 || updateResult[0].acct !== this.acct) {
        this.logger.error(`Failed to update on tx ${signature}`);
        return Err({ type: TxWatcherBackfillErrorType.WatcherUpdateFailure });
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
    const newCheckedUpToSlot =
      this.checkedUpToSlot > latestFinalizedSlot
        ? this.checkedUpToSlot
        : latestFinalizedSlot;
    if (newCheckedUpToSlot === latestFinalizedSlot) {
      this.logger.log(`using finalized slot of ${latestFinalizedSlot}`);
    }
    const updateResult = await usingDb(db => db
      .update(schema.transactionWatchers)
      .set({
        checkedUpToSlot: newCheckedUpToSlot,
      })
      .where(eq(schema.transactionWatchers.acct, this.acct))
      .returning({ acct: schema.transactionWatchers.acct }));
    if (updateResult.length !== 1 || updateResult[0].acct !== this.acct) {
      this.logger.error(`Failed to update at end of backfill`);
      return Err({ type: TxWatcherBackfillErrorType.WatcherUpdateFailure });
    }
    this.checkedUpToSlot = newCheckedUpToSlot;
    return Ok(true);
  }
}
