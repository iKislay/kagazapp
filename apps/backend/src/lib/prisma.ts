import { PrismaClient } from '@prisma/client';
import { isProduction } from '../env.js';

/**
 * One PrismaClient per process.
 *
 * Connection pooling: the pool size is set on the connection string
 * (`?connection_limit=N`) rather than here, because the right number depends on
 * where the backend is deployed — see prisma/README.md. With a pooler in front
 * (Supabase PgBouncer, Neon), `DATABASE_URL` points at the pooled port and
 * `DIRECT_DATABASE_URL` at the direct one, which is what migrations use.
 */
function createClient(): PrismaClient {
  return new PrismaClient({
    log: isProduction
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
  });
}

// In dev, `tsx watch` re-evaluates this module on every save. Without the
// global, each reload would open a new pool and the database would run out of
// connections after a dozen edits.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

/** Cheap liveness probe — used by the readiness check, not by `/health`. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export type { PrismaClient };
