'use client';

import EngramApp from '@/src/engram';

export default function E2EPage() {
  if (process.env.NEXT_PUBLIC_E2E !== 'true') {
    return null;
  }

  return <EngramApp />;
}
