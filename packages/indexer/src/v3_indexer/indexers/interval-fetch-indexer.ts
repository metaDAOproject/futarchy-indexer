import { Result, TaggedUnion } from "../match";
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
  indexFromLogs(logs: string[]): Promise<
    Result<
      {
        acct: string;
      },
      TaggedUnion
    >
  >;
};
