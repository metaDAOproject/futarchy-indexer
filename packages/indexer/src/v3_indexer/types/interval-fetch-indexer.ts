import { Result, TaggedUnion } from "../utils/match";
export type IntervalFetchIndexer = {
  cronExpression: string;
  retries?: number;
  index(acct: string): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};
