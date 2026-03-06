import { redirect } from 'next/navigation';
import { loginAction } from './actions';
import { getCurrentSession } from '@/src/server/api/auth';
import { CredentialPage } from '@/src/views/credential-page';

const getSingleParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({
	searchParams
}: {
	searchParams?: { error?: string | string[]; email?: string | string[] };
}) {
	const session = await getCurrentSession();
	if (session) redirect('/');
	return (
		<CredentialPage
			mode="login"
			action={loginAction}
			error={getSingleParam(searchParams?.error) ?? null}
			defaultEmail={getSingleParam(searchParams?.email) ?? ''}
		/>
	);
}
