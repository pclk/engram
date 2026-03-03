'use client';

import { Home } from '@/src/views/home';
import { neonConfigDiagnostics } from '@/src/lib/auth';

function MissingConfigPanel() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <section style={{ maxWidth: '40rem', width: '100%' }}>
        <h1>Neon configuration required</h1>
        <p>The app is missing required environment variables.</p>
        <ul>
          {neonConfigDiagnostics.missingKeys.map(key => (
            <li key={key}>
              <code>{key.replace('VITE_', 'NEXT_PUBLIC_')}</code>
            </li>
          ))}
        </ul>
        <p>
          You can still use guest mode at <a href="/guest">/guest</a>.
        </p>
      </section>
    </main>
  );
}

export default function Page() {
  if (!neonConfigDiagnostics.isConfigured) {
    return <MissingConfigPanel />;
  }

  return <Home />;
}
