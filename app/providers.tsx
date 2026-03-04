'use client';

import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';
import { authClient } from '@/lib/auth-client';
import { navigate, replace, toast } from '@/lib/auth-ui';

export function Providers({ children }: { children: React.ReactNode }) {
  if (!authClient) {
    return <>{children}</>;
  }

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      redirectTo="/"
      navigate={navigate}
      replace={replace}
      toast={toast}
      emailOTP
      emailVerification
    >
      {children}
    </NeonAuthUIProvider>
  );
}
