/**
 * Vitest setup.
 *
 * `src/env.ts` refuses to load without a DATABASE_URL — deliberately, since a
 * backend that boots without a database is a worse failure than one that does
 * not boot. The unit tests still need to import it, so a placeholder is
 * supplied here and flagged, so that the integration tests can tell a real
 * database from this stand-in and skip themselves rather than fail.
 */
if (!process.env['DATABASE_URL']) {
  process.env['DATABASE_URL'] =
    'postgresql://kagaz:kagaz@localhost:5432/kagaz_placeholder?schema=public';
  process.env['KAGAZ_NO_DATABASE'] = '1';
}

process.env['NODE_ENV'] ??= 'test';
process.env['LOG_LEVEL'] ??= 'error';
