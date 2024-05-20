import { startIndexers } from "./indexers";
import { TransactionWatcher } from "./transaction/watcher";
import { startMetricsServer } from "./metrics";
import { populateIndexers } from "./cli/txw/populate";

await populateIndexers();
startMetricsServer();
await startIndexers();
startMetricsServer();
new TransactionWatcher().startAll();
