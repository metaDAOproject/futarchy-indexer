import { startIndexers } from "./indexers";
import { startIndexerAccountDependencyPopulation } from "./cli/txw/populate";
import { startTransactionWatchers } from "./transaction/watcher";
import { startServer } from "./server";
import runLocalTest from "./localRun"

startServer();
startIndexerAccountDependencyPopulation();

//await runLocalTest();

await startTransactionWatchers();
await startIndexers();
