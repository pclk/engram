import { redirect } from 'next/navigation';
import { serializeSession, serializeUser, getCurrentSession } from '@/src/server/api/auth';
import { Account } from '@/src/views/account';

export default async function AccountRootPage() {
	const session = await getCurrentSession();
	if (!session) redirect('/login');

	return (
		<Account
			initialSection="settings"
			initialData={{
				user: serializeUser(session.user),
				session: serializeSession(session)
			}}
		/>
	);
}
