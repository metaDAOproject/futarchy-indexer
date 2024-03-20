import { PublicKey } from "@solana/web3.js";
import { getDBConnection, schema, eq} from "@themetadao/indexer-db";
import { SERIALIZED_TRANSACTION_LOGIC_VERSION, getTransaction, serialize } from "./serializer";
import { getTransactionHistory } from "./history";

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

type TransactionWatcherRecord = typeof schema.transactionWatchers._.model.select;
type TransactionRecord = typeof schema.transactions._.model.insert;

const watchers: Record<string, TransactionWatcher> = {};

let totalTxsIndexed = 0;

class TransactionWatcher {
  private account: PublicKey;
  private description: string;
  private latestTxSig: string | undefined;
  private checkedUpToSlot: bigint;
  private logicVersion: number;
  private pollerIntervalId: ReturnType<typeof setInterval> | undefined;
  private rpcWebsocket: number | undefined;
  private stopped: boolean;
  public constructor({acct, description, latestTxSig, checkedUpToSlot, serializerLogicVersion}: TransactionWatcherRecord) {
    this.account = new PublicKey(acct);
    this.description = description;
    this.latestTxSig = latestTxSig ?? undefined;
    this.checkedUpToSlot = checkedUpToSlot;
    this.logicVersion = serializerLogicVersion;
    this.stopped = false;
    this.start();
  }

  private async start() {
    if (this.pollerIntervalId !== undefined) {
      throw new Error(`Interval was ${this.pollerIntervalId} when starting ${this.account.toBase58()}`);
    }
    await this.backfillFromLatest();
    // TODO: add websocket for realtime updates (might be lossy, but would allow us to increase poll time meaning less rpc costs)
    this.pollerIntervalId = setInterval(() => {
      if (this.stopped) return;
      this.backfillFromLatest();
    }, 60000);
  }

  private async backfillFromLatest() {
    const history = await getTransactionHistory(
      this.account,
      this.checkedUpToSlot,
      {after: this.latestTxSig}
    );
    console.log(`history after ${this.latestTxSig} is length ${history.length}`);
    const db = await getDBConnection();
    try {
      const acct = this.account.toBase58();
      for (const signatureInfo of history) {
        if (this.stopped) {
          console.log(`Stopped watcher for ${acct} mid backfill`);
          return;
        }
        const { slot: slotAsNum, signature } = signatureInfo;
        const slot = BigInt(slotAsNum);
        // TODO: lock should be done here. It's probably fine for now since we only have 1 instance.
        //       I can think of weird states though where you have this stopped watcher and another started one.
        // Leaving as todo since optimistic locking might be preferred 
        const curWatcherRecord = (await db.con.select().from(schema.transactionWatchers).where(eq(schema.transactionWatchers.acct, acct)).execute())[0];
        const {checkedUpToSlot} = curWatcherRecord;
        if (slot <= checkedUpToSlot) {
          throw new Error(`watcher for account ${acct} supposedly checked up to slot ${checkedUpToSlot} but history returned sig ${signature} with slot ${slot}`);
          process.exit(1);
        }
        const maybeCurTxRecord = await db.con.select().from(schema.transactions).where(eq(schema.transactions.txSig, signature)).execute();
        if (maybeCurTxRecord.length === 0 || maybeCurTxRecord[0].serializerLogicVersion < SERIALIZED_TRANSACTION_LOGIC_VERSION) {
          const parseTxResult = await getTransaction(signature);
          if (!parseTxResult.success) {
            console.log(`Failed to parse tx ${signature}`);
            console.log(JSON.stringify(parseTxResult.error));
            process.exit(1);
          }
          const {ok: serializableTx} = parseTxResult;
          const transactionRecord: TransactionRecord = {
            txSig: signature,
            slot,
            blockTime: new Date(serializableTx.blockTime * 1000), // TODO need to verify if this is correct
            failed: serializableTx.err !== undefined,
            payload: serialize(parseTxResult.ok),
            serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION
          };
          const upsertResult = await db.con.insert(schema.transactions).values(transactionRecord)
            .onConflictDoUpdate({
              target: schema.transactions.txSig,
              set: transactionRecord
            })
            .returning({txSig: schema.transactions.txSig});
          if (upsertResult.length !== 1 || upsertResult[0].txSig !== signature) {
            console.log(`Failed to upsert ${signature}. ${JSON.stringify(transactionRecord)}`);
            process.exit(1);
          }
          // TODO: maybe i need to validate below succeeded. I can't use returning because this isn't an upsert so it could
          //       be a no-op in the happy path
          await db.con.insert(schema.transactionWatcherTransactions).values({
            txSig: signature,
            slot,
            watcherAcct: acct
          }).onConflictDoNothing();
          // TODO: perhaps only checkedUpToSlot update at the end is necessary
          const updateResult = await db.con.update(schema.transactionWatchers)
            .set({
              acct,
              latestTxSig: signature,
              firstTxSig: curWatcherRecord.firstTxSig ?? signature,
              serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
              checkedUpToSlot: slot // TODO, I think this breaks for many txs in the same slot. more evidence that update should only happen after history is traversed
            })
            .where(eq(schema.transactionWatchers.acct, acct))
            .returning({acct: schema.transactionWatchers.acct});
          if (updateResult.length !== 1 || updateResult[0].acct !== acct) {
            console.log(`Failed to update tx watcher for acct ${acct} on tx ${signature}`);
            process.exit(1);
          }
        }
        totalTxsIndexed++;
        console.log(`${totalTxsIndexed} done with ${signature}`);
      }
      // TODO update checkedUpToSlot to latest confirmed slot. If we don't do this, then checkedUpToSlot would only be updated once there's a new
      // transaction, and this would mean indexers would stall in cases where some of the dependent watchers don't have frequent transactions.
    } finally {
      db.client.release();
    }
  }

  public stop() {
    this.stopped = true;
    if (this.pollerIntervalId === undefined) {
      throw new Error(`Interval was ${this.pollerIntervalId} when stopping ${this.account.toBase58()}`);
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
      const curWatchers = await db.con.select().from(schema.transactionWatchers).execute();
      console.log(`total watchers in db = ${curWatchers.length}`);
      console.log(`total watchers in running = ${Object.keys(watchers).length}`);
      const curWatchersByAccount: Record<string, TransactionWatcherRecord> = {};
      const watchersToStart: Set<string> = new Set();
      const watchersToStop: Set<string> = new Set();
      for (const watcherInDb of curWatchers) {
        curWatchersByAccount[watcherInDb.acct] = watcherInDb;
        const alreadyWatching = watcherInDb.acct in watchers;
        if (!alreadyWatching) {
          watchersToStart.add(watcherInDb.acct);
        } else {
          if (watcherInDb.serializerLogicVersion !== SERIALIZED_TRANSACTION_LOGIC_VERSION) {
            const {acct, serializerLogicVersion} = watcherInDb;
            console.log(`reseting ${acct}. existing logic version of ${serializerLogicVersion} current is ${SERIALIZED_TRANSACTION_LOGIC_VERSION}`);
            watchers[acct]?.stop();
            delete watchers[acct];
            const updated = await db.con.update(schema.transactionWatchers)
              .set({
                serializerLogicVersion: SERIALIZED_TRANSACTION_LOGIC_VERSION,
                latestTxSig: null,
                checkedUpToSlot: BigInt(0)
              })
              .where(eq(schema.transactionWatchers.acct, acct))
              .returning({acct: schema.transactionWatchers.acct});
            if (updated.length !== 1 || updated[0].acct !== acct) {
              throw new Error(`Failed to update ${acct} watcher. ${JSON.stringify(updated)}`);
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
        console.log(`Stopping ${watchersToStop.size} watchers:`);
        let i = 0;
        for(const watcherToStopAcct of watchersToStop) {
          console.log(` ${++i}. ${watcherToStopAcct}`);
          watchers[watcherToStopAcct]?.stop();
          delete watchers[watcherToStopAcct];
        }
      }
      if (watchersToStart.size) {
        console.log(`Starting ${watchersToStart.size} watchers:`);
        let i = 0;
        for (const watcherToStartAcct of watchersToStart) {
          const prefix = ` ${++i}. `;
          console.log(`${prefix}${watcherToStartAcct}`);
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
