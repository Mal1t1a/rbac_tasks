const { contextBridge, ipcRenderer } = require('electron');

// Import IPC channels directly instead of using dynamic path resolution
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

contextBridge.exposeInMainWorld('api', {
	getServerInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SERVER_INFO),
	getEnv: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ENV),
	startLogin: () => ipcRenderer.invoke(IPC_CHANNELS.START_LOGIN),
	logout: () => ipcRenderer.invoke(IPC_CHANNELS.LOGOUT),
	refreshToken: () => ipcRenderer.invoke(IPC_CHANNELS.REFRESH_TOKEN),
	onBackendEvent: (listener) =>
	{
		const handler = (_event, payload) => listener?.(payload);
		ipcRenderer.on(IPC_CHANNELS.BACKEND_EVENT, handler);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.BACKEND_EVENT, handler);
	},
	// Window controls
	windowMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
	windowMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
	windowUnmaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_UNMAXIMIZE),
	windowClose: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
	windowIsMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
	onWindowStateChanged: (listener) =>
	{
		const handler = (_event, payload) => listener?.(payload);
		ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler);
		return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, handler);
	}
});
