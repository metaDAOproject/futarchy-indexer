import { startIndexers } from "./indexers";
import { startIndexerAccountDependencyPopulation } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";
import { startServer } from "./server";

// startServer();
// startIndexerAccountDependencyPopulation();

// await startTransactionWatchers();
await startIndexers();
