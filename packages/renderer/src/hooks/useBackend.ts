import { useCallback, useEffect, useState } from 'react';

export interface TokenStatus
{
	provider: string;
	isAuthenticated: boolean;
	needsLogin: boolean;
	needsRefresh: boolean;
	expiresAt: number | null;
}

export interface UserProfile
{
	id: string;
	login: string;
	display_name: string;
	email?: string;
	profile_image_url?: string;
	offline_image_url?: string;
	description?: string;
	broadcaster_type?: string;
	created_at?: string;
}

export interface ServerInfo
{
	port: number | null;
	env: Record<string, string>;
	tokenStatus: TokenStatus | null;
}

export function useBackend()
{
	const [serverInfo, setServerInfo] = useState<ServerInfo>({
		port: null,
		env: {},
		tokenStatus: null
	});
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const updateStatus = useCallback(async (port?: number | null) =>
	{
		const resolvedPort = port ?? serverInfo.port;
		if (!resolvedPort)
		{
			return;
		}
		try
		{
			const response = await fetch(`http://localhost:${resolvedPort}/api/oauth/status`);
			if (!response.ok)
			{
				// Endpoint not available under JWT backend; ignore without error
				setServerInfo((prev) => ({ ...prev, tokenStatus: null }));
				return;
			}
			const data = (await response.json()) as { status: TokenStatus };
			setServerInfo((prev) => ({ ...prev, tokenStatus: data.status }));
		} catch (err)
		{
			// Silently ignore status errors; OAuth endpoints may not exist in this backend
			setServerInfo((prev) => ({ ...prev, tokenStatus: null }));
		}
	}, [serverInfo.port]);

	const fetchUserProfile = useCallback(async (port?: number | null) =>
	{
		const resolvedPort = port ?? serverInfo.port;
		if (!resolvedPort)
		{
			return;
		}
		try
		{
			const response = await fetch(`http://localhost:${resolvedPort}/api/user/profile`);
			if (!response.ok)
			{
				throw new Error(await response.text());
			}
			const data = (await response.json()) as { profile: UserProfile | null };
			setUserProfile(data.profile);
		} catch (err)
		{
			setUserProfile(null);
			// Don't set error for profile fetch failures as user might not be logged in
		}
	}, [serverInfo.port]);

	useEffect(() =>
	{
		let cancel = false;
		async function bootstrap()
		{
			setLoading(true);
			try
			{
				const info = await window.api?.getServerInfo();
				if (info && !cancel)
				{
					setServerInfo({
						port: info.port ?? null,
						env: info.env ?? {},
						tokenStatus: info.tokenStatus ?? null
					});
					// Do not call OAuth-specific endpoints by default; they may not exist under JWT backend
				}
			} catch (err)
			{
				if (!cancel)
				{
					setError((err as Error).message);
				}
			} finally
			{
				if (!cancel)
				{
					setLoading(false);
				}
			}
		}
		bootstrap();
		const dispose = window.api?.onBackendEvent?.((event) =>
		{
			if (event.type === 'oauth:updated')
			{
				setServerInfo((prev) => ({ ...prev, tokenStatus: event.payload as TokenStatus }));
				// Optionally fetch user profile in Twitch mode; skip by default
			}
			if (event.type === 'server:port')
			{
				setServerInfo((prev) => ({ ...prev, port: (event.payload as any)?.port ?? prev.port }));
			}
		});
		return () =>
		{
			cancel = true;
			dispose?.();
		};
	}, [updateStatus, fetchUserProfile]);

	const startLogin = useCallback(async () =>
	{
		setError(null);
		const response = await window.api?.startLogin();
		if (!response?.url)
		{
			throw new Error('Unable to start Twitch login flow');
		}
		return response.url;
	}, []);

	const logout = useCallback(async () =>
	{
		setError(null);
		await window.api?.logout();
		await updateStatus();
		setUserProfile(null); // Clear profile on logout
	}, [updateStatus]);

	const refresh = useCallback(async () =>
	{
		setError(null);
		await window.api?.refreshToken();
		await updateStatus();
		await fetchUserProfile();
	}, [updateStatus, fetchUserProfile]);

	return {
		serverInfo,
		userProfile,
		loading,
		error,
		startLogin,
		refresh,
		logout,
		updateStatus,
		fetchUserProfile
	};
}
