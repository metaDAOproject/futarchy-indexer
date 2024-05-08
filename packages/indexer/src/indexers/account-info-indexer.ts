import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { Result, TaggedUnion } from "../match";
export type AccountInfoIndexer = {
  index(
    accountInfo: AccountInfo<Buffer>,
    account: PublicKey,
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
