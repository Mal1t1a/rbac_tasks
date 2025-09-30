import type { TokenStatus } from './hooks/useBackend';

declare global
{
	interface BackendEvent
	{
		type: string;
		payload?: unknown;
	}

	interface BackendServerInfo
	{
		port: number | null;
		env: Record<string, string>;
		tokenStatus: TokenStatus | null;
	}

	interface Window
	{
		api?: {
			getServerInfo: () => Promise<BackendServerInfo>;
			getEnv: () => Promise<Record<string, string>>;
			onBackendEvent: (listener: (event: BackendEvent) => void) => () => void;
			startLogin: () => Promise<{ url: string }>;
			logout: () => Promise<void>;
			refreshToken: () => Promise<void>;
			windowMinimize: () => Promise<void>;
			windowMaximize: () => Promise<void>;
			windowUnmaximize: () => Promise<void>;
			windowClose: () => Promise<void>;
			windowIsMaximized: () => Promise<boolean>;
			onWindowStateChanged: (listener: (state: { isMaximized: boolean }) => void) => () => void;
		};
	}
}

export { };
