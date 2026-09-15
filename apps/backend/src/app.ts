import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { env, isProduction } from './env.js';
import { registerHealthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  /** Silence the logger in tests. */
  readonly logger?: boolean;
}

/**
 * Builds the Fastify instance without listening, so tests can drive it
 * through `app.inject()` with no port in play.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const useLogger = options.logger ?? true;

  const app = Fastify({
    logger: useLogger
      ? {
          level: env.LOG_LEVEL,
          // Pretty output locally; structured JSON everywhere that matters.
          ...(isProduction ? {} : { transport: { target: 'pino-pretty' } }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-razorpay-signature"]',
              'req.headers["x-hub-signature-256"]',
            ],
            censor: '[redacted]',
          },
        }
      : false,
    // Webhook signature verification needs the exact bytes, so keep the raw body.
    bodyLimit: 1_048_576,
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(registerHealthRoutes);

  return app;
}
