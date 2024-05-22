import { startIndexers } from "./indexers";
import { startMetricsServer } from "./metrics";
import { startIndexerAccountDependencyPopulation } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";

startIndexerAccountDependencyPopulation();
startMetricsServer();
if (process.env.ENABLE_TRANSACTION_WATCHERS) {
  await startTransactionWatchers();
}
if (process.env.ENABLE_INDEXERS) {
  await startIndexers();
}
