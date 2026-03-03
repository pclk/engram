'use client';

import dynamic from 'next/dynamic';

const AuthShell = dynamic(() => import('@/src/views/auth/shell').then(module => module.AuthShell), { ssr: false });

export default function AuthRootPage() {
  return <AuthShell />;
}
