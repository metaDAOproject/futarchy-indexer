import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schemaDefs from "./schema";
import { Pool, PoolClient } from "pg";
import "dotenv/config";

let connectionString = process.env.FUTARCHY_PG_URL;

// Add retry configuration
const RETRY_ATTEMPTS = 12;
const INITIAL_RETRY_DELAY = 1000; // Start with shorter delay
const MAX_RETRY_DELAY = 600000;    // Max backoff delay
const ACQUIRE_TIMEOUT = 10000;   // 10 second timeout for acquiring connection

// Add connection pool configuration
const poolConfig = {
  connectionString: connectionString,
  min: 3,
  max: 300, // Reduced from 1000 to a more reasonable number
  idleTimeoutMillis: 5 * 1000,
  connectionTimeoutMillis: 5 * 1000,
  acquireTimeoutMillis: 60 * 1000,
  evictionRunIntervalMillis: 1000,
  // Add error handling for the pool
  async errorHandler(err: Error) {
    console.error('Pool error:', err);
  }
};

const pool = new Pool(poolConfig);

// Add pool error listeners
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// Add new constants for monitoring
const POOL_STATS_INTERVAL = 30000; // Log every 30 seconds
const POOL_WARNING_THRESHOLD = 300;  // Warn when total connections exceed this

setInterval(() => {
  const stats = pool.totalCount;
  const idle = pool.idleCount;
  const waiting = pool.waitingCount;
  const active = stats - idle;

  console.log('Database Pool Statistics:', {
    total: stats,
    active,
    idle,
    waiting,
    available: poolConfig.max - stats
  });

  if (stats > POOL_WARNING_THRESHOLD) {
    console.warn('High connection pool usage detected', {
      total: stats,
      threshold: POOL_WARNING_THRESHOLD
    });
  }
}, POOL_STATS_INTERVAL);

export async function getClient() {
  return pool.connect();
}

// Modified usingDb function with retry logic
export async function usingDb<T>(
  fn: (connection: NodePgDatabase<typeof schemaDefs>) => Promise<T>
): Promise<T | undefined> {
  let client: PoolClient | undefined;
  let attempts = 0;

  while (attempts < RETRY_ATTEMPTS) {
    try {
      // Add timeout to connection acquisition
      const acquirePromise = pool.connect();
      client = await Promise.race([
        acquirePromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Connection acquisition timeout')), ACQUIRE_TIMEOUT)
        )
      ]);

      const connection = drizzle(pool, { schema: schemaDefs });
      const result = await fn(connection);
      return result;
    } catch (e) {
      attempts++;
      if (attempts === RETRY_ATTEMPTS) {
        console.error('Final database connection attempt failed:', e);
        throw e;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, attempts - 1) + Math.random() * 100,
        MAX_RETRY_DELAY
      );
      
      console.warn(
        `Database connection attempt ${attempts} failed, retrying in ${delay}ms:`,
        e instanceof Error ? e.message : e
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}

export type DBTransaction = Parameters<
  Parameters<NodePgDatabase<typeof schemaDefs>["transaction"]>[0]
>[0];

export const schema = schemaDefs;
export {
  eq,
  sql,
  asc,
  desc,
  count,
  lte,
  gte,
  gt,
  notInArray,
  not,
  and,
  or,
  notIlike,
  like,
  ilike,
  isNotNull,
  isNull,
  inArray,
} from "drizzle-orm";
