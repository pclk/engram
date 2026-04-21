import { notFound, redirect } from 'next/navigation';
import { serializeSession, serializeUser, getCurrentSession } from '@/src/server/api/auth';
import { Account } from '@/src/views/account';
import { resolveAccountSection } from '@/src/views/account-sections';

type AccountCatchAllPageProps = {
	params: {
		slug?: string[];
	};
};

export default async function AccountPage({ params }: AccountCatchAllPageProps) {
	const section = resolveAccountSection(params.slug);
	if (!section) notFound();

	const session = await getCurrentSession();
	if (!session) redirect('/login');

	return (
		<Account
			initialSection={section}
			initialData={{
				user: serializeUser(session.user),
				session: serializeSession(session)
			}}
		/>
	);
}
