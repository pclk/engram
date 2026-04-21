'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, {
	useEffect,
	useId,
	useRef,
	useState,
	type ChangeEvent
} from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth';
import {
	changePasswordSchema,
	updateAvatarSchema,
	updateProfileSchema
} from '@/lib/schemas/auth';
import {
	accountSectionMeta,
	accountSections,
	type AccountSection
} from './account-sections';

type AccountUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	createdAt: string;
	updatedAt: string;
};

type AccountSession = {
	id: string;
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
};

export type AccountPayload = {
	user: AccountUser;
	session: AccountSession;
};

type AccountProps = {
	initialSection: AccountSection;
	initialData: AccountPayload;
	variant?: 'page' | 'embedded';
	onOpenWorkspaceSettings?: () => void;
};

type StatusState = {
	type: 'idle' | 'saving' | 'success' | 'error';
	message?: string;
};

const statusClasses: Record<
	Exclude<StatusState['type'], 'idle' | 'saving'>,
	string
> = {
	success: 'border-[#2c3b1f] bg-[rgba(158,206,106,0.12)] text-[#d6f7b5]',
	error: 'border-[#4a2734] bg-[rgba(242,122,147,0.12)] text-[#ffb8c6]'
};

const formatTimestamp = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(date);
};

const getInitials = (name: string, email: string) => {
	const source = name.trim() || email.trim();
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return 'EG';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const getStatusMessageClass = (status: StatusState) =>
	status.type === 'error' ? 'text-[#ff9aaa]' : 'text-[#9ece6a]';

const getErrorMessage = (error: any, fallback: string) => {
	const firstIssueMessage = error?.issues?.[0]?.message;
	if (typeof firstIssueMessage === 'string' && firstIssueMessage.trim().length > 0) {
		return firstIssueMessage;
	}
	if (typeof error?.message === 'string' && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
};

const inputClassName =
	'mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-sm text-[#cbd3f2] outline-none transition focus:border-[#5b79d6]/70 focus:shadow-[0_0_0_2px_rgba(91,121,214,0.16)]';

const actionButtonClassName =
	'rounded-lg border border-[#2a3350] px-3 py-2 text-sm font-bold text-[#9bb2ff] transition hover:bg-[#2a3350]/30 disabled:cursor-not-allowed disabled:opacity-60';

const panelClassName =
	'rounded-2xl border border-[#22283a] bg-[#161b27] p-5 shadow-[0_18px_50px_rgba(10,13,21,0.28)]';

const tabClassName = (isActive: boolean) =>
	`rounded-xl border px-3 py-2 text-sm font-bold transition ${
		isActive
			? 'border-[#5b79d6]/60 bg-[#1a2235] text-[#e3e8ff]'
			: 'border-[#252c40] text-[#aab4d7] hover:bg-[#1d2334]'
	}`;

export function Account({
	initialSection,
	initialData,
	variant = 'page',
	onOpenWorkspaceSettings
}: AccountProps) {
	const router = useRouter();
	const avatarInputId = useId();
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const isEmbedded = variant === 'embedded';
	const [activeSectionKey, setActiveSectionKey] =
		useState<AccountSection>(initialSection);
	const [accountData, setAccountData] = useState(initialData);
	const [profileForm, setProfileForm] = useState({
		name: initialData.user.name,
		email: initialData.user.email
	});
	const [passwordForm, setPasswordForm] = useState({
		currentPassword: '',
		newPassword: '',
		confirmPassword: ''
	});
	const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
	const [avatarStatus, setAvatarStatus] = useState<StatusState>({ type: 'idle' });
	const [profileStatus, setProfileStatus] = useState<StatusState>({ type: 'idle' });
	const [passwordStatus, setPasswordStatus] = useState<StatusState>({ type: 'idle' });
	const [sessionStatus, setSessionStatus] = useState<StatusState>({ type: 'idle' });
	const {
		user: {
			id: initialUserId,
			email: initialUserEmail,
			name: initialUserName,
			image: initialUserImage,
			createdAt: initialUserCreatedAt,
			updatedAt: initialUserUpdatedAt
		},
		session: {
			id: initialSessionId,
			expiresAt: initialSessionExpiresAt,
			createdAt: initialSessionCreatedAt,
			updatedAt: initialSessionUpdatedAt
		}
	} = initialData;

	useEffect(() => {
		setActiveSectionKey(initialSection);
	}, [initialSection]);

	useEffect(() => {
		setAccountData({
			user: {
				id: initialUserId,
				email: initialUserEmail,
				name: initialUserName,
				image: initialUserImage,
				createdAt: initialUserCreatedAt,
				updatedAt: initialUserUpdatedAt
			},
			session: {
				id: initialSessionId,
				expiresAt: initialSessionExpiresAt,
				createdAt: initialSessionCreatedAt,
				updatedAt: initialSessionUpdatedAt
			}
		});
		setProfileForm({
			name: initialUserName,
			email: initialUserEmail
		});
	}, [
		initialSessionCreatedAt,
		initialSessionExpiresAt,
		initialSessionId,
		initialSessionUpdatedAt,
		initialUserCreatedAt,
		initialUserEmail,
		initialUserId,
		initialUserImage,
		initialUserName,
		initialUserUpdatedAt
	]);

	const activeSection = accountSectionMeta[activeSectionKey];
	const user = accountData.user;
	const session = accountData.session;
	const initials = getInitials(user.name, user.email);
	const memberSince = formatTimestamp(user.createdAt);
	const sessionCreatedAt = formatTimestamp(session.createdAt);
	const sessionExpiresAt = formatTimestamp(session.expiresAt);

	const applyAccountUpdate = (
		payload: { user: AccountUser; session: AccountSession | null } | null
	) => {
		if (!payload?.user || !payload.session) return;
		setAccountData({
			user: payload.user,
			session: payload.session
		});
		setProfileForm({
			name: payload.user.name,
			email: payload.user.email
		});
	};

	const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setAvatarStatus({ type: 'saving' });
		try {
			const image = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(new Error('Avatar upload failed.'));
				reader.readAsDataURL(file);
			});
			const parsed = updateAvatarSchema.parse({ image });
			const result = await authClient.updateUser({
				...parsed,
				fetchOptions: { throw: true }
			});
			applyAccountUpdate(result.data);
			setAvatarStatus({
				type: 'success',
				message: 'Avatar updated.'
			});
		} catch (error: any) {
			setAvatarStatus({
				type: 'error',
				message: getErrorMessage(error, 'Failed to update avatar.')
			});
		} finally {
			event.target.value = '';
		}
	};

	const handleAvatarRemove = async () => {
		setAvatarStatus({ type: 'saving' });
		try {
			const parsed = updateAvatarSchema.parse({ image: null });
			const result = await authClient.updateUser({
				...parsed,
				fetchOptions: { throw: true }
			});
			applyAccountUpdate(result.data);
			setAvatarStatus({
				type: 'success',
				message: 'Avatar removed.'
			});
		} catch (error: any) {
			setAvatarStatus({
				type: 'error',
				message: getErrorMessage(error, 'Failed to remove avatar.')
			});
		}
	};

	const handleProfileSave = async () => {
		setProfileStatus({ type: 'saving' });
		try {
			const updates: Record<string, string> = {};
			const nextName = profileForm.name.trim();
			const nextEmail = profileForm.email.trim();

			if (nextName && nextName !== user.name) updates.name = nextName;
			if (nextEmail && nextEmail !== user.email) updates.email = nextEmail;

			if (Object.keys(updates).length === 0) {
				setProfileStatus({
					type: 'error',
					message: 'No changes to save.'
				});
				return;
			}

			const parsed = updateProfileSchema.parse(updates);
			const result = await authClient.updateUser({
				...parsed,
				fetchOptions: { throw: true }
			});
			applyAccountUpdate(result.data);
			setProfileStatus({
				type: 'success',
				message: 'Profile updated.'
			});
		} catch (error: any) {
			setProfileStatus({
				type: 'error',
				message: getErrorMessage(error, 'Failed to update profile.')
			});
		}
	};

	const handlePasswordSave = async () => {
		setPasswordStatus({ type: 'saving' });
		try {
			const parsed = changePasswordSchema.parse(passwordForm);
			await authClient.changePassword({
				currentPassword: parsed.currentPassword,
				newPassword: parsed.newPassword,
				revokeOtherSessions,
				fetchOptions: { throw: true }
			});
			setPasswordForm({
				currentPassword: '',
				newPassword: '',
				confirmPassword: ''
			});
			setPasswordStatus({
				type: 'success',
				message: revokeOtherSessions
					? 'Password updated. Other sessions were revoked.'
					: 'Password updated.'
			});
		} catch (error: any) {
			setPasswordStatus({
				type: 'error',
				message: getErrorMessage(error, 'Failed to update password.')
			});
		}
	};

	const handleSignOut = async () => {
		setSessionStatus({ type: 'saving' });
		try {
			await authClient.signOut({ fetchOptions: { throw: true } });
			router.replace('/login');
			router.refresh();
		} catch (error: any) {
			setSessionStatus({
				type: 'error',
				message: getErrorMessage(error, 'Failed to sign out.')
			});
		}
	};

	const renderSectionLink = (section: AccountSection, label: string) => {
		const className = `mt-4 inline-flex ${actionButtonClassName}`;
		if (isEmbedded) {
			return (
				<button
					type="button"
					className={className}
					onClick={() => setActiveSectionKey(section)}
				>
					{label}
				</button>
			);
		}
		return (
			<Link className={className} href={accountSectionMeta[section].href}>
				{label}
			</Link>
		);
	};

	const renderWorkspaceSettingsAction = () => {
		const className = `mt-4 inline-flex ${actionButtonClassName}`;
		if (isEmbedded && onOpenWorkspaceSettings) {
			return (
				<button type="button" className={className} onClick={onOpenWorkspaceSettings}>
					Open display tab
				</button>
			);
		}
		return (
			<Link className={className} href="/">
				Open workspace settings
			</Link>
		);
	};

	const overviewContent = (
		<>
			<div className={`${panelClassName} grid gap-4 md:grid-cols-2`}>
				<div className="rounded-xl border border-[#252c40] bg-[#111622] p-4">
					<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
						Profile summary
					</div>
					<div className="mt-4 space-y-2 text-sm text-[#cbd3f2]">
						<div>
							<span className="text-[#7f8bb4]">Name:</span> {user.name}
						</div>
						<div>
							<span className="text-[#7f8bb4]">Email:</span> {user.email}
						</div>
						<div>
							<span className="text-[#7f8bb4]">Avatar:</span>{' '}
							{user.image ? 'Custom image configured' : 'Using initials'}
						</div>
					</div>
					{renderSectionLink('profile', 'Edit profile')}
				</div>
				<div className="rounded-xl border border-[#252c40] bg-[#111622] p-4">
					<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
						Session summary
					</div>
					<div className="mt-4 space-y-2 text-sm text-[#cbd3f2]">
						<div>
							<span className="text-[#7f8bb4]">Created:</span> {sessionCreatedAt}
						</div>
						<div>
							<span className="text-[#7f8bb4]">Expires:</span> {sessionExpiresAt}
						</div>
						<div>
							<span className="text-[#7f8bb4]">Session ID:</span> {session.id}
						</div>
					</div>
					{renderSectionLink('security', 'Review security')}
				</div>
			</div>

			<div className={panelClassName}>
				<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
					Workspace display settings
				</div>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-[#aab4d7]">
					{isEmbedded
						? 'Display and layout controls now live in their own settings tab so you can tune the workspace without leaving account management.'
						: 'Wallpaper, opacity, and keyboard legend preferences are still managed inside the main workspace because they are browser-local display settings, not account-level preferences.'}
				</p>
				{renderWorkspaceSettingsAction()}
			</div>
		</>
	);

	const profileContent = (
		<div className={`${panelClassName} space-y-5`}>
			<div>
				<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
					Avatar
				</div>
				<div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
					<div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#283049] bg-[#101521] text-xl font-bold text-[#9bb2ff]">
						{user.image ? (
							<Image
								src={user.image}
								alt={user.name}
								className="h-full w-full object-cover"
								width={80}
								height={80}
								unoptimized
							/>
						) : (
							initials
						)}
					</div>
					<div>
						<input
							ref={avatarInputRef}
							id={avatarInputId}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleAvatarChange}
						/>
						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								className={actionButtonClassName}
								onClick={() => avatarInputRef.current?.click()}
								disabled={avatarStatus.type === 'saving'}
							>
								Upload avatar
							</button>
							{user.image ? (
								<button
									type="button"
									className="rounded-lg border border-[#4a2734] px-3 py-2 text-sm font-bold text-[#ff9aaa] transition hover:bg-[#4a2734]/25 disabled:cursor-not-allowed disabled:opacity-60"
									onClick={handleAvatarRemove}
									disabled={avatarStatus.type === 'saving'}
								>
									Remove avatar
								</button>
							) : null}
						</div>
						{avatarStatus.message ? (
							<p className={`mt-3 text-sm ${getStatusMessageClass(avatarStatus)}`}>
								{avatarStatus.message}
							</p>
						) : (
							<p className="mt-3 text-sm text-[#8b97bd]">
								Upload a local image or keep the generated initials avatar.
							</p>
						)}
					</div>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="block">
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
						Name
					</span>
					<input
						className={inputClassName}
						value={profileForm.name}
						onChange={(event) =>
							setProfileForm((current) => ({
								...current,
								name: event.target.value
							}))
						}
						placeholder="Your name"
					/>
				</label>
				<label className="block">
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
						Email
					</span>
					<input
						type="email"
						className={inputClassName}
						value={profileForm.email}
						onChange={(event) =>
							setProfileForm((current) => ({
								...current,
								email: event.target.value
							}))
						}
						placeholder="you@example.com"
					/>
				</label>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					className={actionButtonClassName}
					onClick={handleProfileSave}
					disabled={profileStatus.type === 'saving'}
				>
					Save profile
				</button>
				{profileStatus.message ? (
					<span className={`text-sm ${getStatusMessageClass(profileStatus)}`}>
						{profileStatus.message}
					</span>
				) : (
					<span className="text-sm text-[#8b97bd]">
						Last updated {formatTimestamp(user.updatedAt)}
					</span>
				)}
			</div>
		</div>
	);

	const securityContent = (
		<>
			<div className={`${panelClassName} space-y-4`}>
				<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
					Change password
				</div>
				<label className="block">
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
						Current password
					</span>
					<input
						type="password"
						className={inputClassName}
						value={passwordForm.currentPassword}
						onChange={(event) =>
							setPasswordForm((current) => ({
								...current,
								currentPassword: event.target.value
							}))
						}
						placeholder="••••••••"
					/>
				</label>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
							New password
						</span>
						<input
							type="password"
							className={inputClassName}
							value={passwordForm.newPassword}
							onChange={(event) =>
								setPasswordForm((current) => ({
									...current,
									newPassword: event.target.value
								}))
							}
							placeholder="At least 8 characters"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
							Confirm new password
						</span>
						<input
							type="password"
							className={inputClassName}
							value={passwordForm.confirmPassword}
							onChange={(event) =>
								setPasswordForm((current) => ({
									...current,
									confirmPassword: event.target.value
								}))
							}
							placeholder="Repeat new password"
						/>
					</label>
				</div>
				<label className="flex items-start gap-3 rounded-xl border border-[#252c40] bg-[#111622] px-3 py-3 text-sm text-[#cbd3f2]">
					<input
						type="checkbox"
						className="mt-1 h-4 w-4 rounded border-[#41517f] bg-[#101521] text-[#7aa2f7]"
						checked={revokeOtherSessions}
						onChange={(event) => setRevokeOtherSessions(event.target.checked)}
					/>
					<span>Revoke other active sessions after the password change.</span>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						className={actionButtonClassName}
						onClick={handlePasswordSave}
						disabled={passwordStatus.type === 'saving'}
					>
						Update password
					</button>
					{passwordStatus.message ? (
						<span className={`text-sm ${getStatusMessageClass(passwordStatus)}`}>
							{passwordStatus.message}
						</span>
					) : null}
				</div>
			</div>

			<div className={panelClassName}>
				<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
					Current session
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-3">
					<div className="rounded-xl border border-[#252c40] bg-[#111622] p-4">
						<div className="text-xs uppercase tracking-[0.16em] text-[#7f8bb4]">
							Session ID
						</div>
						<div className="mt-2 break-all text-sm text-[#e3e8ff]">
							{session.id}
						</div>
					</div>
					<div className="rounded-xl border border-[#252c40] bg-[#111622] p-4">
						<div className="text-xs uppercase tracking-[0.16em] text-[#7f8bb4]">
							Created
						</div>
						<div className="mt-2 text-sm text-[#e3e8ff]">{sessionCreatedAt}</div>
					</div>
					<div className="rounded-xl border border-[#252c40] bg-[#111622] p-4">
						<div className="text-xs uppercase tracking-[0.16em] text-[#7f8bb4]">
							Expires
						</div>
						<div className="mt-2 text-sm text-[#e3e8ff]">{sessionExpiresAt}</div>
					</div>
				</div>
			</div>
		</>
	);

	const sectionContent = (() => {
		if (activeSectionKey === 'settings') return overviewContent;
		if (activeSectionKey === 'profile') return profileContent;
		return securityContent;
	})();

	if (isEmbedded) {
		return (
			<div className="space-y-5" data-testid="account-settings-panel">
				{sessionStatus.message ? (
					<div
						className={`rounded-xl border px-4 py-3 text-sm ${
							statusClasses[sessionStatus.type as 'success' | 'error']
						}`}
					>
						{sessionStatus.message}
					</div>
				) : null}

				<div className={panelClassName}>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-center gap-4">
							<div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[#283049] bg-[#101521] text-sm font-bold text-[#9bb2ff]">
								{user.image ? (
									<Image
										src={user.image}
										alt={user.name}
										className="h-full w-full object-cover"
										width={64}
										height={64}
										unoptimized
									/>
								) : (
									initials
								)}
							</div>
							<div>
								<div className="text-xs font-bold uppercase tracking-[0.24em] text-[#7f8bb4]">
									Account
								</div>
								<div className="mt-1 text-xl font-bold text-[#e3e8ff]">
									{activeSection.label}
								</div>
								<p className="mt-1 text-sm text-[#94a0c6]">
									{activeSection.description}
								</p>
							</div>
						</div>
						<div className="rounded-xl border border-[#252c40] bg-[#111622] px-4 py-3 text-sm text-[#cbd3f2]">
							<div className="font-bold text-[#e3e8ff]">{user.name}</div>
							<div className="text-[#8b97bd]">{user.email}</div>
							<div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7f8bb4]">
								Member since {memberSince}
							</div>
						</div>
					</div>

					<div
						className="mt-5 flex flex-wrap gap-2"
						role="tablist"
						aria-label="Account sections"
					>
						{accountSections.map((sectionKey) => {
							const section = accountSectionMeta[sectionKey];
							const isActive = sectionKey === activeSectionKey;
							return (
								<button
									key={sectionKey}
									id={`account-section-tab-${sectionKey}`}
									type="button"
									role="tab"
									aria-selected={isActive}
									aria-controls={`account-section-panel-${sectionKey}`}
									className={tabClassName(isActive)}
									onClick={() => setActiveSectionKey(sectionKey)}
									data-testid={`account-section-tab-${sectionKey}`}
								>
									{section.label}
								</button>
							);
						})}
					</div>
				</div>

				<div
					id={`account-section-panel-${activeSectionKey}`}
					role="tabpanel"
					aria-labelledby={`account-section-tab-${activeSectionKey}`}
					className="space-y-5"
				>
					{sectionContent}
				</div>
			</div>
		);
	}

	return (
		<main className="neon-auth-page">
			<section className="w-[min(1080px,96vw)] rounded-[1.25rem] border border-[#2a2f45] bg-[#24283b] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
				<div className="flex flex-col gap-6 p-5 md:p-8">
					<div className="flex flex-col gap-4 border-b border-[#2a2f45] pb-5 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-4">
							<Image
								className="neon-auth-brand-badge"
								src="/logo.svg"
								alt="Engram"
								width={96}
								height={24}
								priority
							/>
							<div>
								<div className="text-xs font-bold uppercase tracking-[0.24em] text-[#7f8bb4]">
									Account
								</div>
								<h1 className="mt-1 text-2xl font-bold text-[#e3e8ff]">
									{activeSection.label}
								</h1>
								<p className="mt-1 text-sm text-[#94a0c6]">
									{activeSection.description}
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-3">
							<Link className={actionButtonClassName} href="/">
								Return to workspace
							</Link>
							<button
								className="rounded-lg border border-[#f27a93]/40 px-3 py-2 text-sm font-bold text-[#ff9aaa] transition hover:bg-[#f27a93]/15 disabled:cursor-not-allowed disabled:opacity-60"
								onClick={handleSignOut}
								disabled={sessionStatus.type === 'saving'}
							>
								Sign out
							</button>
						</div>
					</div>

					{sessionStatus.message ? (
						<div
							className={`rounded-xl border px-4 py-3 text-sm ${
								statusClasses[sessionStatus.type as 'success' | 'error']
							}`}
						>
							{sessionStatus.message}
						</div>
					) : null}

					<div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
						<aside className={`${panelClassName} h-fit`}>
							<div className="text-xs font-bold uppercase tracking-[0.2em] text-[#7f8bb4]">
								Sections
							</div>
							<nav className="mt-4 space-y-2" aria-label="Account sections">
								{accountSections.map((sectionKey) => {
									const section = accountSectionMeta[sectionKey];
									const isActive = sectionKey === activeSectionKey;
									return (
										<Link
											key={sectionKey}
											href={section.href}
											aria-current={isActive ? 'page' : undefined}
											className={`block rounded-xl border px-3 py-3 transition ${
												isActive
													? 'border-[#5b79d6]/60 bg-[#1a2235] text-[#e3e8ff]'
													: 'border-[#252c40] text-[#aab4d7] hover:bg-[#1d2334]'
											}`}
										>
											<div className="text-sm font-bold">{section.label}</div>
											<div className="mt-1 text-xs text-[#8b97bd]">
												{section.description}
											</div>
										</Link>
									);
								})}
							</nav>
							<div className="mt-5 rounded-xl border border-[#252c40] bg-[#111622] px-3 py-3">
								<div className="text-xs font-bold uppercase tracking-[0.18em] text-[#7f8bb4]">
									Current user
								</div>
								<div className="mt-3 flex items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[#283049] bg-[#101521] text-sm font-bold text-[#9bb2ff]">
										{user.image ? (
											<Image
												src={user.image}
												alt={user.name}
												className="h-full w-full object-cover"
												width={48}
												height={48}
												unoptimized
											/>
										) : (
											initials
										)}
									</div>
									<div className="min-w-0">
										<div className="truncate text-sm font-bold text-[#e3e8ff]">
											{user.name}
										</div>
										<div className="truncate text-xs text-[#8b97bd]">
											{user.email}
										</div>
									</div>
								</div>
								<div className="mt-3 text-xs text-[#8b97bd]">
									Member since {memberSince}
								</div>
							</div>
						</aside>

						<div
							id={`account-section-panel-${activeSectionKey}`}
							role="tabpanel"
							className="space-y-6"
						>
							{sectionContent}
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}
