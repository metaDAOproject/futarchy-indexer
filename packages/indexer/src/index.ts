import { startIndexers } from "./indexers";
import { startMetricsServer } from "./metrics";
import { populateIndexers } from "./cli/txw/populate";

await populateIndexers();
// startMetricsServer();
await startIndexers();
