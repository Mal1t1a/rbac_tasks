import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type User = {
	id: string;
	email: string;
	name: string;
	role: string;
	organizationId: string;
	organizationName?: string | null;
	inheritedRoles?: string[];
};

type AuthState = {
	token: string | null;
	user: User | null;
	scope: string[];
	loading: boolean;
	error: string | null;
	pendingWelcome: boolean;
	uiReady: boolean;
};

type LoginResult = {
	firstLogin: boolean;
	firstLoginAt: number | null;
	welcomeVersion: number;
};

type AuthContextValue = AuthState & {
	login: (baseUrl: string, email: string, password: string) => Promise<LoginResult>;
	logout: (baseUrl?: string) => Promise<void>;
	apiFetch: (input: RequestInfo | URL, init?: RequestInit & { baseUrl?: string }) => Promise<Response>;
	consumePendingWelcome: () => void;
	markUIReady: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LS_TOKEN_KEY = 'app.jwt';

export function AuthProvider({ children, baseUrl }: { children: React.ReactNode; baseUrl?: string })
{
	const [state, setState] = useState<AuthState>({ token: null, user: null, scope: [], loading: true, error: null, pendingWelcome: false, uiReady: false });

	useEffect(() =>
	{
		const token = localStorage.getItem(LS_TOKEN_KEY);
		if (!token)
		{
			setState((s) => ({ ...s, loading: false }));
			return;
		}
		if (!baseUrl)
		{
			// Wait for backend baseUrl before validating token to avoid clearing it prematurely.
			return;
		}
		// Try fetching /api/me
		(async () =>
		{
			try
			{
				const res = await fetch(`${baseUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) throw new Error(await res.text());
				const data = (await res.json()) as { user: User; scope: string[] };
				setState({ token, user: data.user, scope: data.scope || [], loading: false, error: null, pendingWelcome: false, uiReady: true });
			} catch (err)
			{
				localStorage.removeItem(LS_TOKEN_KEY);
				setState({ token: null, user: null, scope: [], loading: false, error: null, pendingWelcome: false, uiReady: false });
			}
		})();
	}, [baseUrl]);

	const login = useCallback(async (apiBase: string, email: string, password: string): Promise<LoginResult> =>
	{
		setState((s) => ({ ...s, error: null }));
		const res = await fetch(`${apiBase}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
		if (!res.ok)
		{
			throw new Error(await res.text());
		}
		const data = (await res.json()) as { token: string; user: User; scope: string[]; firstLogin?: boolean; firstLoginAt?: number | null; welcomeVersion?: number };
		localStorage.setItem(LS_TOKEN_KEY, data.token);
		setState({ token: data.token, user: data.user, scope: data.scope || [], loading: false, error: null, pendingWelcome: Boolean(data.firstLogin), uiReady: !Boolean(data.firstLogin) });
		return {
			firstLogin: Boolean(data.firstLogin),
			firstLoginAt: data.firstLoginAt ?? null,
			welcomeVersion: data.welcomeVersion ?? 1
		};
	}, []);

	const logout = useCallback(async (apiBase?: string) =>
	{
		try
		{
			const token = state.token;
			if (apiBase && token)
			{
				await fetch(`${apiBase}/api/session/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
			}
		} catch { }
		localStorage.removeItem(LS_TOKEN_KEY);
		setState({ token: null, user: null, scope: [], loading: false, error: null, pendingWelcome: false, uiReady: false });
	}, [state.token]);

	const apiFetch = useCallback(
		(input: RequestInfo | URL, init?: RequestInit & { baseUrl?: string }) =>
		{
			const url = typeof input === 'string' || input instanceof URL ? input : (input as Request).url;
			const absolute = (init?.baseUrl || baseUrl || '') + (typeof url === 'string' ? url : url.toString());
			const headers = new Headers(init?.headers);
			if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
			if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData))
			{
				headers.set('Content-Type', 'application/json');
			}
			return fetch(absolute, { ...init, headers });
		},
		[state.token, baseUrl]
	);

	const consumePendingWelcome = useCallback(() =>
	{
		setState((s) => ({ ...s, pendingWelcome: false }));
	}, []);

	const markUIReady = useCallback(() =>
	{
		setState((s) => ({ ...s, uiReady: true }));
	}, []);

	const value = useMemo<AuthContextValue>(() => ({ ...state, login, logout, apiFetch, consumePendingWelcome, markUIReady }), [state, login, logout, apiFetch, consumePendingWelcome, markUIReady]);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth()
{
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');
	return ctx;
}
