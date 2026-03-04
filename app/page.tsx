import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Home } from '@/src/views/home';
import { neonConfigDiagnostics } from '@/src/lib/auth';
import { SESSION_COOKIE_NAME } from '@/src/server/api/auth';

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

export default async function Page() {
  if (!neonConfigDiagnostics.isConfigured) {
    return <MissingConfigPanel />;
  }

  const cookieStore = await cookies();
  const hasSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSessionCookie) {
    redirect('/auth/sign-in');
  }

  return <Home />;
}
