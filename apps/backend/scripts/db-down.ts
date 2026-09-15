/**
 * Rolls back the most recently applied migration.
 *
 * Prisma has no built-in down-migration. The Phase 1 acceptance criterion is
 * "a down-migration runs cleanly", and the reason it matters is not elegance —
 * it is that a bad migration against a live shop's money data at 9pm needs a
 * rehearsed way back, not an improvised one.
 *
 * The convention: a migration that can be reversed ships a `down.sql` beside
 * its `migration.sql`. Prisma-generated migrations do not have one, and the
 * script says so rather than guessing.
 *
 *   pnpm db:down            # roll back the newest applied migration
 *   pnpm db:down --dry-run  # show what would run
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'prisma', 'migrations');

const dryRun = process.argv.includes('--dry-run');

/** Splits a SQL file on the explicit breakpoint marker. */
function statements(sql: string): string[] {
  return sql
    .split(/^\s*-->\s*statement-breakpoint\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)+$/.test(s));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `;

    const latest = applied[0];
    if (!latest) {
      console.log('\n  Nothing to roll back — no applied migrations.\n');
      return;
    }

    const name = latest.migration_name;
    const downPath = join(migrationsDir, name, 'down.sql');

    if (!existsSync(downPath)) {
      const hasFolder = readdirSync(migrationsDir).includes(name);
      console.error(
        `\n  The newest applied migration is "${name}"` +
          (hasFolder ? '' : ' (its folder is missing from prisma/migrations)') +
          `\n  and it has no down.sql, so it cannot be rolled back by this script.` +
          `\n\n  For a Prisma-generated migration, either write a down.sql beside its` +
          `\n  migration.sql, or use \`pnpm db:reset\` if losing the data is acceptable.\n`,
      );
      process.exit(1);
    }

    const sql = readFileSync(downPath, 'utf8');
    const parts = statements(sql);

    console.log(`\n  Rolling back: ${name}  (${parts.length} statements)`);

    if (dryRun) {
      parts.forEach((s, i) => console.log(`\n  --- ${i + 1} ---\n${s}`));
      console.log('\n  Dry run — nothing was executed.\n');
      return;
    }

    for (const statement of parts) {
      await prisma.$executeRawUnsafe(statement);
    }

    await prisma.$executeRaw`
      DELETE FROM _prisma_migrations WHERE migration_name = ${name}
    `;

    console.log(`  Rolled back ${name}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('\n  Rollback failed:', error, '\n');
  process.exit(1);
});
