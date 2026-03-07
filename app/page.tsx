import { redirect } from 'next/navigation';
import { Home } from '@/src/views/home';
import { getCurrentSession } from '@/src/server/api/auth';

export default async function Page() {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/login');
  }

  return <Home />;
}
