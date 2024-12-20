
import {
  IndexerImplementation,
  IndexerType,
} from "@metadaoproject/indexer-db/lib/schema";

export type IndexerWithAccountDeps = {
  indexers: {
    name: string;
    implementation: IndexerImplementation;
    latestSlotProcessed: string;
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
};

export type UserPerformanceTotals = {
  tokensBought: number;
  tokensSold: number;
  volumeBought: number;
  volumeSold: number;
  tokensBoughtResolvingMarket: number;
  tokensSoldResolvingMarket: number;
  volumeBoughtResolvingMarket: number;
  volumeSoldResolvingMarket: number;
  buyOrderCount: number;
  sellOrderCount: number;
};

export type UserPerformance = {
  proposalAcct: string;
} & User &
  UserPerformanceTotals;
