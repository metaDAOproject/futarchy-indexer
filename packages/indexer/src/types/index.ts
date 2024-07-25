import {
  IndexerImplementation,
  IndexerType,
} from "@metadaoproject/indexer-db/lib/schema";

export type IndexerWithAccountDeps = {
  indexers: {
    name: string;
    implementation: IndexerImplementation;
    latestSlotProcessed: bigint;
    indexerType: IndexerType;
  } | null;
  indexer_account_dependencies: {
    name: string;
    acct: string;
    latestTxSigProcessed: string | null;
  } | null;
};

export type User = {
  userAcct: string;
}

export type UserPerformanceTotals = {
  tokensBought: string
  tokensSold: string;
  volumeBought: string;
  volumeSold: string;
}

export type UserPerformance = {
  proposalAcct: string;
} & User & UserPerformanceTotals