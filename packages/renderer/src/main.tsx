import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, BrowserRouter } from 'react-router';
import App from './App';
import './styles.css';

// Use BrowserRouter in dev (served via http://localhost) and HashRouter in production (file:// in Electron)
const isFileProtocol = window.location.protocol === 'file:';
const Router: React.FC<{ children: React.ReactNode }> = ({ children }) =>
{
	if (isFileProtocol)
	{
		return <HashRouter>{children}</HashRouter>;
	}
	return <BrowserRouter>{children}</BrowserRouter>;
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<Router>
			<App />
		</Router>
	</React.StrictMode>
);
