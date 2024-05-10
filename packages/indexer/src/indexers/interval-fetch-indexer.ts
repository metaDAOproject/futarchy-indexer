import { Result, TaggedUnion } from "../match";
export type IntervalFetchIndexer = {
  intervalMs: number;
  index(acct: string): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};
