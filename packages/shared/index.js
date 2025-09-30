const IPC_CHANNELS = {
	GET_SERVER_INFO: 'server:get-info',
	BACKEND_EVENT: 'backend:event',
	GET_ENV: 'env:get',
	START_LOGIN: 'oauth:start-login',
	LOGOUT: 'oauth:logout',
	REFRESH_TOKEN: 'oauth:refresh',
	WINDOW_MINIMIZE: 'window:minimize',
	WINDOW_MAXIMIZE: 'window:maximize',
	WINDOW_UNMAXIMIZE: 'window:unmaximize',
	WINDOW_CLOSE: 'window:close',
	WINDOW_IS_MAXIMIZED: 'window:is-maximized',
	WINDOW_STATE_CHANGED: 'window:state-changed'
};

const PUBLIC_ENV_PREFIX = 'APP_PUBLIC_';

module.exports = {
	IPC_CHANNELS,
	PUBLIC_ENV_PREFIX
};

