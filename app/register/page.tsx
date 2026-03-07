import { redirect } from 'next/navigation';
import { registerAction } from './actions';
import { getCurrentSession } from '@/src/server/api/auth';
import { CredentialPage } from '@/src/views/credential-page';

const getSingleParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function RegisterPage({
	searchParams
}: {
	searchParams?: { error?: string | string[]; name?: string | string[]; email?: string | string[] };
}) {
	const session = await getCurrentSession();
	if (session) redirect('/');
	return (
		<CredentialPage
			mode="register"
			action={registerAction}
			error={getSingleParam(searchParams?.error) ?? null}
			defaultName={getSingleParam(searchParams?.name) ?? ''}
			defaultEmail={getSingleParam(searchParams?.email) ?? ''}
		/>
	);
}
