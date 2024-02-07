import { drizzle } from 'drizzle-orm/node-postgres';
import * as schemaDefs from './schema';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.FUTARCHY_PG_URL
});

export async function getDBConnection() {
  await pool.connect();
  return drizzle(pool, {schema: schemaDefs});
}

export const schema = schemaDefs;
export * as drizzle from 'drizzle-orm';
