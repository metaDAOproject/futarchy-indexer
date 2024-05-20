import { Result, TaggedUnion } from "../result";
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
