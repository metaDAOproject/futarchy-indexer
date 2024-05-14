import { TransactionWatcher } from "./transaction/watcher";
import { startMetricsServer } from "./metrics";

startMetricsServer();
new TransactionWatcher().startAll();
