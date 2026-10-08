import { SHARED_PACKAGE_NAME, asPaise, formatPaise } from '@kagaz/shared';

/**
 * Phase 0 placeholder. It renders a value computed by @kagaz/shared, which is
 * how we know workspace resolution reaches the renderer bundle and not just
 * the main process.
 */
export function App(): JSX.Element {
  return (
    <main className="shell">
      <h1>Kagaz</h1>
      <p className="tagline">The app being open is the shop being open.</p>
      <dl className="facts">
        <dt>Shared package</dt>
        <dd>{SHARED_PACKAGE_NAME}</dd>
        <dt>Money formatting</dt>
        <dd>{formatPaise(asPaise(14250))}</dd>
        <dt>Phase</dt>
        <dd>0 — foundations</dd>
      </dl>
    </main>
  );
}
