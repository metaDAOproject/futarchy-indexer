import { Context, PublicKey } from "@solana/web3.js";
import { Result, TaggedUnion } from "../match";

export type DaoIndexer = {
  index(
    context?: Context
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};

export type ProposalIndexer = {
  index(
    context?: Context
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};

export type ConditionalVaultIndexer = {
  index(
    context?: Context
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};

export type MarketIndexer = {
  index(
    context?: Context
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
}

// These are types in the db, which we'll build off of the data we fetch
// but are not specifically fetched AFAIK now..
export type Token = {};

export type TokenAccount = {};