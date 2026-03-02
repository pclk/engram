import { Component, type ErrorInfo, type ReactNode } from 'react';

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
		if (import.meta.env.DEV) {
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
						background: '#fff5f5',
						color: '#7f1d1d',
					}}
				>
					<section
						style={{
							maxWidth: '40rem',
							width: '100%',
							background: '#ffffff',
							border: '1px solid #fecaca',
							borderRadius: '0.75rem',
							padding: '1.25rem',
							boxShadow: '0 8px 24px rgba(127, 29, 29, 0.08)',
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
