import { startIndexers } from "./v3_indexer/indexers";
import { startIndexerAccountDependencyPopulation } from "./v3_indexer/cli/txw/populate";
import { startTransactionWatchers } from "./v3_indexer/transaction/watcher";
import { subscribeAll } from "./subscriber";


// startIndexerAccountDependencyPopulation();
subscribeAll();

await startTransactionWatchers();
await startIndexers();
