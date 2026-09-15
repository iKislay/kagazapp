import type { KagazApi } from '../../electron/preload.js';

declare global {
  interface Window {
    readonly kagaz: KagazApi;
  }
}

export {};
