'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
	children: ReactNode;
};

type AppErrorBoundaryState = {
	hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	state: AppErrorBoundaryState = {
		hasError: false,
	};

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		if (process.env.NODE_ENV !== 'production') {
			console.error('Application crashed in AppErrorBoundary.', error, errorInfo);
		}
	}

	render() {
		if (this.state.hasError) {
			return (
				<main
					role="alert"
					style={{
						minHeight: '100vh',
						display: 'grid',
						placeItems: 'center',
						padding: '1.5rem',
						background: '#1a1b26',
						color: '#c0caf5',
					}}
				>
					<section
						style={{
							maxWidth: '40rem',
							width: '100%',
							background: '#24283b',
							border: '1px solid #414868',
							borderRadius: '0.75rem',
							padding: '1.25rem',
							boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
						}}
					>
						<h1 style={{ marginTop: 0 }}>Something went wrong</h1>
						<p>The app hit an unexpected error and could not continue.</p>
						<h2>Likely causes</h2>
						<ul>
							<li>Missing or invalid environment variables.</li>
							<li>Authentication provider configuration is incomplete.</li>
						</ul>
						<h2>Next steps</h2>
						<ul>
							<li>
								Try the guest route: <a href="/guest">/guest</a>
							</li>
							<li>Verify your <code>.env.local</code> values.</li>
							<li>Open the browser console for detailed error logs.</li>
						</ul>
					</section>
				</main>
			);
		}

		return this.props.children;
	}
}
