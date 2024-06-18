import { startIndexers } from "./indexers";
import { startIndexerAccountDependencyPopulation } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";
import { startServer } from "./server";

startIndexerAccountDependencyPopulation();
startServer();
await startTransactionWatchers();
await startIndexers();
