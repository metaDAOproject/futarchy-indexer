import { startIndexers } from "./v3_indexer/indexers";
import { startIndexerAccountDependencyPopulation } from "./v3_indexer/cli/txw/populate";
import { startTransactionWatchers } from "./v3_indexer/transaction/watcher";
import { subscribeAll } from "./subscriber";
import { frontfill as v4_frontfill, backfill as v4_backfill } from "./v4_indexer/filler";
import { logger } from "./logger";

async function main() {
  try {
    // Start all indexing processes
    await Promise.all([
      // startIndexerAccountDependencyPopulation(),

      subscribeAll().catch(err => {
        logger.errorWithChatBotAlert("Error in subscribeAll:", err);
      }),
      
      v4_backfill().catch(err => {
        logger.errorWithChatBotAlert("Error in v4_backfill:", err);
      }),
      
      v4_frontfill().catch(err => {
        logger.errorWithChatBotAlert("Error in v4_frontfill:", err);
      }),

      startTransactionWatchers().catch(err => {
        logger.errorWithChatBotAlert("Error in startTransactionWatchers:", err);
      }),
      
      startIndexers().catch(err => {
        logger.errorWithChatBotAlert("Error in startIndexers:", err); 
      })
    ]);

    // Keep process running
    process.on('uncaughtException', (err) => {
      logger.errorWithChatBotAlert("Uncaught exception:", err);
    });

    process.on('unhandledRejection', (err) => {
      logger.errorWithChatBotAlert("Unhandled rejection:", err);
    });

  } catch (error) {
    logger.errorWithChatBotAlert("Critical error in indexer:", error);
  }
}

main().catch(err => {
  logger.errorWithChatBotAlert("Fatal error starting indexer:", err);
  process.exit(1);
});
