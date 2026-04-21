import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	updateUserMock,
	changePasswordMock,
	signOutMock,
	replaceMock,
	refreshMock
} = vi.hoisted(() => ({
	updateUserMock: vi.fn(),
	changePasswordMock: vi.fn(),
	signOutMock: vi.fn(),
	replaceMock: vi.fn(),
	refreshMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		replace: replaceMock,
		refresh: refreshMock
	})
}));

vi.mock('next/link', () => ({
	default: ({ href, children, ...props }: any) => (
		<a href={href} {...props}>
			{children}
		</a>
	)
}));

vi.mock('next/image', () => ({
	default: ({ alt, priority: _priority, ...props }: any) => <img alt={alt} {...props} />
}));

vi.mock('@/lib/auth', () => ({
	authClient: {
		updateUser: updateUserMock,
		changePassword: changePasswordMock,
		signOut: signOutMock
	}
}));

import { Account } from '@/src/views/account';

const initialData = {
	user: {
		id: 'user_123',
		email: 'ada@example.com',
		name: 'Ada Lovelace',
		image: null,
		createdAt: '2026-01-01T10:00:00.000Z',
		updatedAt: '2026-01-02T10:00:00.000Z'
	},
	session: {
		id: 'sess_123',
		expiresAt: '2026-02-01T10:00:00.000Z',
		createdAt: '2026-01-03T10:00:00.000Z',
		updatedAt: '2026-01-03T10:00:00.000Z'
	}
};

describe('Account view', () => {
	beforeEach(() => {
		updateUserMock.mockReset();
		changePasswordMock.mockReset();
		signOutMock.mockReset();
		replaceMock.mockReset();
		refreshMock.mockReset();
	});

	it('renders the overview section with navigation links', () => {
		render(<Account initialSection="settings" initialData={initialData} />);

		expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
		expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
		expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
			'href',
			'/account/profile'
		);
		expect(screen.getByRole('link', { name: 'Review security' })).toHaveAttribute(
			'href',
			'/account/security'
		);
	});

	it('shows a local validation error when profile details are unchanged', async () => {
		render(<Account initialSection="profile" initialData={initialData} />);

		fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

		expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
		expect(updateUserMock).not.toHaveBeenCalled();
	});

	it('shows the password confirmation validation error before calling the API', async () => {
		render(<Account initialSection="security" initialData={initialData} />);

		fireEvent.change(screen.getByLabelText('Current password'), {
			target: { value: 'current-password' }
		});
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'new-password' }
		});
		fireEvent.change(screen.getByLabelText('Confirm new password'), {
			target: { value: 'different-password' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

		expect(
			await screen.findByText('New password and confirmation must match.')
		).toBeInTheDocument();
		expect(changePasswordMock).not.toHaveBeenCalled();
	});

	it('supports the embedded account variant used by the workspace settings modal', () => {
		const openWorkspaceSettingsMock = vi.fn();

		render(
			<Account
				initialSection="settings"
				initialData={initialData}
				variant="embedded"
				onOpenWorkspaceSettings={openWorkspaceSettingsMock}
			/>
		);

		expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
			'aria-selected',
			'true'
		);

		fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));

		expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
		fireEvent.click(screen.getByRole('button', { name: 'Open display tab' }));

		expect(openWorkspaceSettingsMock).toHaveBeenCalledTimes(1);
	});
});
