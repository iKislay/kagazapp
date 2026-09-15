import { contextBridge } from 'electron';

/**
 * The renderer gets exactly what we hand it here and nothing else
 * (contextIsolation is on, nodeIntegration is off).
 *
 * Phase 4 adds the real IPC surface: order list, printer status, queue state.
 */
const api = {
  appVersion: process.env['npm_package_version'] ?? '0.1.0',
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
} as const;

export type KagazApi = typeof api;

contextBridge.exposeInMainWorld('kagaz', api);
