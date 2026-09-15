import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';

export interface HealthResponse {
  readonly ok: true;
  readonly version: string;
  readonly commit: string;
}

/**
 * `GET /health` — the one route Phase 0 ships.
 *
 * It reports the running commit so that "is the deploy actually live?" is
 * answerable with a curl, which is the whole point of the endpoint.
 */
export const registerHealthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['ok', 'version', 'commit'],
            properties: {
              ok: { type: 'boolean' },
              version: { type: 'string' },
              commit: { type: 'string' },
            },
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      ok: true,
      version: env.APP_VERSION,
      commit: env.GIT_COMMIT,
    }),
  );
};
