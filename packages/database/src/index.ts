import { getDBConnection } from '../lib';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const db = await getDBConnection();
  try {
    console.log('migration started');
    await migrate(db.con, {migrationsFolder: 'drizzle'});
    console.log('migration finished');
  } finally {
    db.client.release();
  }
}

main()
  .catch((e: Error) => {
    console.log('Migration Error:', e.message);
    process.exit(0);
  })
  .finally(() => {
    process.exit(0);
  });
