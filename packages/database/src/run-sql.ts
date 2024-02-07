import { getDBConnection, drizzle } from '../lib';
import { green } from 'ansicolor';
import table from 'as-table';

const COMMON_STATEMENTS: Record<string, string> = {
  'all-tables': "select * from pg_catalog.pg_tables where schemaname != 'pg_catalog' AND schemaname != 'information_schema'"
};

async function main() {
  const db = await getDBConnection();
  const arg = process.argv[2];
  const statement = COMMON_STATEMENTS[arg] ?? arg;
  console.log(green(statement));
  const result = await db.execute(drizzle.sql.raw(statement));
  if (result.rowCount) {
    console.log('total:', result.rowCount);
    console.log(table(result.rows));
    return;
  }
  // TODO: pretty print other types of output
  console.log(result);
}

main()
  .catch((error: Error) => {
    console.log("Postgres Error: " + error.message);
    process.exit(0);
  })
  .finally(() => {
    process.exit(0);
  });
