/**
 * @kagaz/shared — types and pure logic shared by the backend and the desktop app.
 *
 * Everything in here must stay pure: no database, no network, no filesystem,
 * no `process.env`. That is what makes it testable in milliseconds and safe
 * to run inside the Electron main process.
 */

export const SHARED_PACKAGE_NAME = '@kagaz/shared' as const;

export * from './money.js';
export * from './page-range.js';
export * from './pricing.js';
export * from './order-state.js';
export * from './errors.js';
export * from './ws-protocol.js';
