import { startIndexers } from "./v3_indexer/indexers";
import { startIndexerAccountDependencyPopulation } from "./v3_indexer/cli/txw/populate";
import { startTransactionWatchers } from "./v3_indexer/transaction/watcher";
import { subscribeAll } from "./subscriber";
import { frontfill as v4_frontfill, backfill as v4_backfill } from "./v4_indexer/filler";


// startIndexerAccountDependencyPopulation();
subscribeAll();

// startTransactionWatchers();
// startIndexers();


// v4_backfill();
// v4_frontfill();
