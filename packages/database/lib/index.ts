import { drizzle } from 'drizzle-orm/node-postgres';
import * as schemaDefs from './schema';
import { Pool } from 'pg';
import 'dotenv/config'

const pool = new Pool({
  connectionString: process.env.FUTARCHY_PG_URL,
  // https://stackoverflow.com/a/73997522
  // I noticed that there was always a connection timeout error after 9 loops of the startWatchers interval;
  // it repeats every 5 seconds and immediately after service start.
  // That's a consistent error after 40 seconds. So I'm seeing if idle timeout of 20 seconds works. I suspect it won't though
  // since the connection is never idle for more than 5 seconds and yet we still get a connection error. 
  min: 0,
  idleTimeoutMillis: 20 * 1000
});

export async function getDBConnection() {
  const client = await pool.connect();
  return {con: drizzle(pool, {schema: schemaDefs}), client};
}

export type DBTransaction = 
  Parameters<Parameters<(Awaited<ReturnType<typeof getDBConnection>>)['con']['transaction']>[0]>[0];

export const schema = schemaDefs;
export {eq, sql, desc, count, lte} from 'drizzle-orm';
