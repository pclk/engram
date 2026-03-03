import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

const getRuntimeNeonEnv = () => ({
  NEXT_PUBLIC_NEON_AUTH_URL: process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? process.env.NEON_AUTH_URL ?? '',
  NEXT_PUBLIC_NEON_DATA_API_URL:
    process.env.NEXT_PUBLIC_NEON_DATA_API_URL ?? process.env.NEON_DATA_API_URL ?? ''
});

export const metadata: Metadata = {
  title: 'Engram',
  description: 'Engram knowledge workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const runtimeNeonEnv = getRuntimeNeonEnv();
  const runtimeNeonEnvScript = `window.__ENGRAM_RUNTIME_ENV=${JSON.stringify(runtimeNeonEnv).replace(/</g, '\\u003c')};`;

  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: runtimeNeonEnvScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
