import { startIndexers } from "./indexers";
import { startMetricsServer } from "./metrics";
import { startIndexerAccountDependencyPopulation } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";

startIndexerAccountDependencyPopulation();
startMetricsServer();
await startTransactionWatchers();
await startIndexers();
