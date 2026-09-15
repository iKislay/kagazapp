import { buildApp } from './app.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = (signal: string): void => {
    app.log.info({ signal }, 'shutting down');
    void app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ error }, 'error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(
    { version: env.APP_VERSION, commit: env.GIT_COMMIT, env: env.NODE_ENV },
    'kagaz backend listening',
  );
}

main().catch((error: unknown) => {
  console.error('failed to start server', error);
  process.exit(1);
});
