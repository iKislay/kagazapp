/**
 * Stamps a hand-written SQL file from `prisma/sql/` into a timestamped Prisma
 * migration folder.
 *
 * Why this exists: Prisma generates migrations for everything it can express,
 * and cannot express triggers, views or partial indexes. Those have to be
 * hand-written — but they must still be *tracked* migrations, applied in order,
 * in every environment. Naming the folder at run time (rather than committing a
 * fixed timestamp) guarantees it sorts after whatever `prisma migrate dev` has
 * just generated.
 *
 *   pnpm db:migrate:sql ledger_trigger_and_views
 *   pnpm db:migrate            # applies it
 *
 * The generated folder is committed to git like any other migration.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, '..', 'prisma');
const sqlDir = join(prismaDir, 'sql');
const migrationsDir = join(prismaDir, 'migrations');

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  const available = existsSync(sqlDir)
    ? readdirSync(sqlDir)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .map((f) => `    - ${f.replace(/\.sql$/, '')}`)
        .join('\n')
    : '    (none)';
  fail(`Usage: pnpm db:migrate:sql <name>\n\n  Available SQL files:\n${available}`);
}

const source = join(sqlDir, `${name}.sql`);
if (!existsSync(source)) fail(`No such SQL file: prisma/sql/${name}.sql`);

// Prisma's own format: YYYYMMDDHHMMSS in UTC.
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const folder = join(migrationsDir, `${stamp}_${name}`);

if (existsSync(folder)) fail(`Migration folder already exists: ${folder}`);

mkdirSync(folder, { recursive: true });
copyFileSync(source, join(folder, 'migration.sql'));

// The matching down.sql travels with the migration so `pnpm db:down` can find it.
const down = join(sqlDir, `${name}.down.sql`);
if (existsSync(down)) {
  copyFileSync(down, join(folder, 'down.sql'));
}

console.log(`\n  Created prisma/migrations/${stamp}_${name}/`);
console.log(`  Review it, then run: pnpm db:migrate\n`);
