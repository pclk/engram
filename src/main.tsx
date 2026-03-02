import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './engram-markdown.css';

const root = createRoot(document.getElementById('root')!);
root.render(
	<React.StrictMode>
		<AppErrorBoundary>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</AppErrorBoundary>
	</React.StrictMode>
);
