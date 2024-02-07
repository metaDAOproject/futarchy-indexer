import { getDBConnection } from '../lib';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const db = await getDBConnection();
  console.log('migration started');
  await migrate(db, {migrationsFolder: 'drizzle'});
  console.log('migration finished');
}

main()
  .catch((e: Error) => {
    console.log('Migration Error:', e.message);
    process.exit(0);
  })
  .finally(() => {
    process.exit(0);
  });
