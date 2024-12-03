import { Context, Logs, PublicKey } from "@solana/web3.js";
import { Result, TaggedUnion } from "../utils/match";
export type AccountLogsIndexer = {
  index(
    logs: Logs,
    account: PublicKey,
    context: Context
  ): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};
