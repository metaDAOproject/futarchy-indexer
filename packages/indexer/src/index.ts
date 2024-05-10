import { startIndexers } from "./indexers";
import { startMetricsServer } from "./metrics";
import { populateIndexers } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";

await populateIndexers();
startMetricsServer();
await startTransactionWatchers();
await startIndexers();
