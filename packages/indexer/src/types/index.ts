import { BN } from "@coral-xyz/anchor";
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
};

export type UserPerformanceTotals = {
  tokensBought: BN;
  tokensSold: BN;
  volumeBought: BN;
  volumeSold: BN;
};

export type UserPerformance = {
  proposalAcct: string;
} & User &
  UserPerformanceTotals;
