import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schemaDefs from "./schema";
import { Pool, PoolClient } from "pg";
import "dotenv/config";

let connectionString = process.env.FUTARCHY_PG_URL;

const pool = new Pool({
  connectionString: connectionString,

  // https://stackoverflow.com/a/73997522
  // I noticed that there was always a connection timeout error after 9 loops of the startWatchers interval;
  // it repeats every 5 seconds and immediately after service start.
  // That's a consistent error after 40 seconds. So I'm seeing if idle timeout of 20 seconds works. I suspect it won't though
  // since the connection is never idle for more than 5 seconds and yet we still get a connection error.
  min: 0,
  idleTimeoutMillis: 20 * 1000,
});

export async function getClient() {
  return pool.connect();
}

export async function usingDb<T>(
  fn: (connection: NodePgDatabase<typeof schemaDefs>) => Promise<T>
): Promise<T | null> {
  let client: PoolClient | null = null;
  let result: T | null = null;
  try {
    client = await pool.connect();
    const connection = drizzle(pool, { schema: schemaDefs });
    result = await fn(connection);
  } catch (e) {
    console.error("usingDb error", e);
  } finally {
    if (client) {
      client.release();
    }
    return result;
  }
}

export type DBTransaction = Parameters<
  Parameters<NodePgDatabase<typeof schemaDefs>["transaction"]>[0]
>[0];

export const schema = schemaDefs;
export {
  eq,
  sql,
  desc,
  count,
  lte,
  gte,
  notInArray,
  not,
  and,
  notIlike,
  like,
  ilike,
} from "drizzle-orm";
