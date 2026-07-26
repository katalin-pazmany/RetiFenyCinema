import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function main() {
  const connectionString = process.argv[2] ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Usage: npx tsx scripts/migrate.ts [connectionString]  (or set DATABASE_URL)');
    process.exit(1);
  }
  const sql = neon(connectionString);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
