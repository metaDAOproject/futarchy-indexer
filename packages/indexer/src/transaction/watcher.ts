import { PublicKey } from "@solana/web3.js";
import { getDBConnection, schema, eq} from "@themetadao/indexer-db";
import { SERIALIZED_TRANSACTION_LOGIC_VERSION } from "./serializer";
import { getTransactionHistory } from "./history";

type TransactionWatcherRecord = typeof schema.transactionWatchers._.model.select;

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
    // TODO: read history, save to db
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
    const curWatchers = await db.select().from(schema.transactionWatchers).execute();
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
          const updated = await db.update(schema.transactionWatchers)
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
  }
  setInterval(() => {
    if (!updatingWatchers) {
      getWatchers();
    }
  }, 5000);
  getWatchers();
}
