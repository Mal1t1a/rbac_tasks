const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, BrowserView, ipcMain, shell, nativeTheme } = require('electron');
const crypto = require('crypto');

const isDev = !app.isPackaged;

// Mitigate blank window issues on some Windows drivers in production
if (!isDev)
{
	try { app.disableHardwareAcceleration(); } catch (_) { }
}

// Resolve module paths based on environment
const backendModule = isDev
	? path.resolve(__dirname, '..', '..', '..', 'packages', 'backend')
	: path.join(__dirname, '..', 'backend');

const sharedModule = isDev
	? path.resolve(__dirname, '..', '..', '..', 'packages', 'shared')
	: path.join(__dirname, '..', 'shared');

const { createBackendServer } = require(backendModule);
const { IPC_CHANNELS } = require(sharedModule);

let mainWindow;
let backend;
let splashLoaded = false;
let splashView = null;
let transitionDone = false;

function buildSplashHtml(message = 'Starting...', userName = null, theme = null)
{
	// Splash defaults to light theme, then upgrades to dark if system preference indicates
	const logoText = userName ? `Welcome back ${userName}` : 'Task Management';
	const initialTheme = theme || 'light';
	const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <head>
        <meta charset='utf-8' />
        <title>${logoText}</title>
        <meta name='color-scheme' content='light dark'>
        <style>
          :root { color-scheme: light dark; }
          html,body { margin:0; padding:0; width:100%; height:100%; font:14px system-ui, sans-serif; -webkit-user-select:none; }
          body { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; -webkit-app-region: drag; transition: background .25s, color .25s; }
          body[data-theme='light'] { background:#ffffff; color:#111827; }
          body[data-theme='dark'] { background:#0f1115; color:#e5e7eb; }
          .logo { font-size:32px; letter-spacing:1px; font-weight:600; }
          .status { font-size:13px; opacity:.65; }
          .spinner { width:40px; height:40px; border-radius:50%; border:4px solid rgba(0,0,0,.1); border-top-color:#3A7AFE; animation:spin 1s linear infinite; }
          body[data-theme='dark'] .spinner { border:4px solid #1f2937; border-top-color:#6366f1; }
          @keyframes spin { to { transform:rotate(360deg); } }
          /* Only fade content, keep background opaque to avoid cross-fade */
          .content { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; transition: opacity .5s ease; }
          .content.fade-out { opacity: 0; }
        </style>
        ${theme ? '' : `<script>(function(){try{var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t='light';if(prefersDark)t='dark';document.addEventListener('DOMContentLoaded',function(){document.body.setAttribute('data-theme',t);});}catch(e){}})();</script>`}
      </head>
      <body data-theme='${initialTheme}'>
        <div class='content'>
          <div class='logo'>${logoText}</div>
          <div class='spinner'></div>
          <div class='status'>${message}</div>
        </div>
      </body>
    </html>
  `)}`;
	return html;
}

async function createMainWindow()
{
	const dataDir = resolveDataDir();
	const defaultEnvPath = isDev
		? path.join(__dirname, '..', '..', '..', '.env')
		: path.join(path.dirname(process.execPath), '.env');
	const envPath = await ensureEnvFile(defaultEnvPath, dataDir);

	try
	{
		backend = backend || createBackendServer({
			cwd: app.getAppPath(),
			dataDir,
			envPath
		});
	} catch (err)
	{
		await ensureWindow();
		await loadErrorPage(mainWindow, `Backend failed to start.\n${(err && err.message) || err}`);
		return; // Do not proceed if backend didn't start
	}

	// Get logged in user name for splash screen
	let userName = null;
	try
	{
		const session = await backend.getCurrentSession();
		if (session && session.token_expires_at > Math.floor(Date.now() / 1000))
		{
			const user = await backend.getUserById(session.user_id);
			userName = user ? user.name : null;
		}
	} catch (err)
	{
		console.log('Error getting current session:', err);
	}

	setupBackendEvents();
	setupIpcHandlers();

	const preloadPath = resolvePreloadPath();
	const isDark = nativeTheme.shouldUseDarkColors;
	const winBgColor = isDark ? '#0f1115' : '#ffffff';

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 860,
		minWidth: 960,
		minHeight: 640,
		backgroundColor: winBgColor,
		show: true,
		title: 'Task Management',
		frame: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: preloadPath || undefined,
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	// Bring to front decisively
	try
	{
		mainWindow.setAlwaysOnTop(true);
		mainWindow.show();
		mainWindow.focus();
		mainWindow.setAlwaysOnTop(false);
	} catch (_) { }

	// Ensure window is visible even if ready-to-show doesn't fire
	if (isDev)
	{
		mainWindow.webContents.once('did-finish-load', () =>
		{
			try { mainWindow.webContents.openDevTools({ mode: 'detach' }); } catch (_) { }
		});
	}

	// Surface load failures instead of silently hanging
	mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) =>
	{
		loadErrorPage(mainWindow, `Renderer failed to load (code ${errorCode}): ${errorDescription}\nURL: ${validatedURL || 'n/a'}`);
		removeSplashImmediate();
	});

	mainWindow.webContents.on('render-process-gone', (_event, details) =>
	{
		loadErrorPage(mainWindow, `Renderer process gone: ${details && details.reason ? details.reason : 'unknown'}`);
		removeSplashImmediate();
	});

	// Listen for window state changes
	mainWindow.on('maximize', () =>
	{
		mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, { isMaximized: true });
	});

	mainWindow.on('unmaximize', () =>
	{
		mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, { isMaximized: false });
	});

	// Load initial splash as BrowserView overlay so window is movable and renderer can load beneath
	try
	{
		splashView = new BrowserView({
			webPreferences: { nodeIntegration: false, contextIsolation: true }
		});
		mainWindow.addBrowserView(splashView);
		const [cw, ch] = mainWindow.getContentSize();
		splashView.setBounds({ x: 0, y: 0, width: cw, height: ch });
		splashView.setAutoResize({ width: true, height: true });
		await splashView.webContents.loadURL(buildSplashHtml(undefined, userName, isDark ? 'dark' : 'light'));
		splashLoaded = true;
	} catch (_) { }

	// When renderer finishes loading behind splash, orchestrate transition
	mainWindow.webContents.once('did-finish-load', () =>
	{
		startSplashTransition();
	});

	if (isDev)
	{
		// Poll dev server until available then load it
		waitForDevServerAndLoad(mainWindow, 0, userName, isDark ? 'dark' : 'light');
	} else
	{
		// Load production renderer shortly after allowing paint of splash
		setTimeout(() =>
		{
			loadProductionRenderer();
		}, 150);
	}
}

async function loadProductionRenderer()
{
	if (!mainWindow) return;
	const rendererIndex = resolveRendererIndex();
	if (rendererIndex)
	{
		try
		{
			await mainWindow.loadFile(rendererIndex);
		} catch (err)
		{
			await loadErrorPage(mainWindow, `Failed to load renderer index.\n${rendererIndex}\n\n${(err && err.message) || err}`);
			removeSplashImmediate();
		}
	} else
	{
		await loadErrorPage(mainWindow, 'Could not locate renderer/index.html next to the executable.');
		removeSplashImmediate();
	}
}

function waitForDevServerAndLoad(win, attempt = 0, userName = null, theme = null)
{
	const maxAttempts = 200; // ~20s at 100ms
	const url = 'http://localhost:5173';
	const fetch = require('node:https').request ? global.fetch || require('node-fetch') : null;
	// Use a lightweight http get without adding fetch dependency if not present
	const http = require('http');
	const req = http.request(url, { method: 'GET' }, (res) =>
	{
		res.resume();
		if (res.statusCode >= 200 && res.statusCode < 500)
		{
			win.loadURL(url).catch(() => { });
			return;
		}
		retry();
	});
	req.on('error', retry);
	req.end();

	function retry()
	{
		if (attempt >= maxAttempts)
		{
			// Update splash status once if we exceed attempts
			if (splashLoaded && splashView)
			{
				try { splashView.webContents.loadURL(buildSplashHtml('Dev server not responding...', userName, theme || null)); } catch (_) { }
			}
			return;
		}
		setTimeout(() => waitForDevServerAndLoad(win, attempt + 1, userName, theme), 100);
	}
}

function removeSplashImmediate()
{
	try
	{
		if (splashView && mainWindow)
		{
			mainWindow.removeBrowserView(splashView);
		}
	} catch (_) { }
	splashView = null;
}

function startSplashTransition()
{
	if (transitionDone) return;
	transitionDone = true;
	// Prepare renderer for fade-in: start invisible
	try
	{
		mainWindow?.webContents.executeJavaScript(
			'try { const doc = document.documentElement; doc.style.opacity = "0"; doc.style.transition = "opacity 500ms ease"; } catch(e) {}',
			true
		).catch(() => { });
	} catch (_) { }

	// Fade out splash content over 500ms
	try
	{
		splashView?.webContents.executeJavaScript(
			"(function(){ var el = document.querySelector('.content'); if (el) el.classList.add('fade-out'); })();",
			true
		).catch(() => { });
	} catch (_) { }

	// After 500ms fade + 100ms pause, hide splash and fade in renderer
	setTimeout(() =>
	{
		// Hide splash overlay first to avoid a compositing flicker, then remove after fade-in completes
		try
		{
			if (splashView && mainWindow)
			{
				splashView.setBounds({ x: 0, y: 0, width: 1, height: 1 });
			}
		} catch (_) { }
		try
		{
			mainWindow?.webContents.executeJavaScript(
				'try { requestAnimationFrame(() => { document.documentElement.style.opacity = "1"; }); } catch(e) {}',
				true
			).catch(() => { });
		} catch (_) { }
		// Finally remove the splash overlay after renderer fade-in (~500ms)
		setTimeout(() => { try { removeSplashImmediate(); } catch (_) { } }, 520);
	}, 600);
}

function setupIpcHandlers()
{
	ipcMain.handle(IPC_CHANNELS.GET_SERVER_INFO, async () => ({
		port: backend?.getPort?.() ?? null,
		env: backend?.getPublicEnv?.() ?? {},
		tokenStatus: backend?.getTokenStatus?.() ?? null
	}));

	ipcMain.handle(IPC_CHANNELS.GET_ENV, async () => backend?.getPublicEnv?.() ?? {});

	ipcMain.handle(IPC_CHANNELS.START_LOGIN, async () =>
	{
		const port = backend?.getPort?.();
		if (!port)
		{
			throw new Error('Backend is not ready');
		}
		const url = `http://localhost:${port}/auth/twitch/login`;
		await shell.openExternal(url);
		return { url };
	});

	ipcMain.handle(IPC_CHANNELS.LOGOUT, async () =>
	{
		await backend?.clearTokens?.();
	});

	ipcMain.handle(IPC_CHANNELS.REFRESH_TOKEN, async () =>
	{
		await backend?.refreshTokens?.(true);
	});

	// Window control handlers
	ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () =>
	{
		mainWindow?.minimize();
	});

	ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () =>
	{
		if (mainWindow?.isMaximized())
		{
			mainWindow.unmaximize();
		} else
		{
			mainWindow?.maximize();
		}
	});

	ipcMain.handle(IPC_CHANNELS.WINDOW_UNMAXIMIZE, () =>
	{
		mainWindow?.unmaximize();
	});

	ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () =>
	{
		mainWindow?.close();
	});

	ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () =>
	{
		return mainWindow?.isMaximized() ?? false;
	});
}

function setupBackendEvents()
{
	if (!backend?.events)
	{
		return;
	}
	backend.events.on('server:started', (payload) =>
	{
		mainWindow?.webContents.send(IPC_CHANNELS.BACKEND_EVENT, {
			type: 'server:port',
			payload
		});
	});

	backend.events.on('oauth:updated', (payload) =>
	{
		mainWindow?.webContents.send(IPC_CHANNELS.BACKEND_EVENT, {
			type: 'oauth:updated',
			payload
		});
	});

	backend.events.on('oauth:error', (payload) =>
	{
		mainWindow?.webContents.send(IPC_CHANNELS.BACKEND_EVENT, {
			type: 'oauth:error',
			payload
		});
	});
}

function resolveDataDir()
{
	if (isDev)
	{
		// In development: use project root/data directory
		return path.join(__dirname, '..', '..', '..', 'data');
	} else
	{
		// In production: use data directory next to the executable
		return path.join(path.dirname(process.execPath), 'data');
	}
}

function resolveRendererIndex()
{
	// Try common locations used by electron-builder extraFiles
	const candidates = [
		// Mac app bundle: executable lives in Contents/MacOS, renderer in Contents/renderer
		path.join(path.dirname(process.execPath), '..', 'renderer', 'index.html'),
		path.join(path.dirname(process.execPath), 'renderer', 'index.html'),
		path.join(process.resourcesPath || path.join(path.dirname(process.execPath), 'resources'), 'renderer', 'index.html'),
		path.join(app.getAppPath(), '..', 'renderer', 'index.html'),
		path.join(app.getAppPath(), 'renderer', 'index.html')
	];
	for (const candidate of candidates)
	{
		try
		{
			if (fs.existsSync(candidate)) return candidate;
		} catch (_)
		{
			// ignore
		}
	}
	return null;
}

async function loadErrorPage(win, message)
{
	const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Task Management - Error</title>
        <style>
          body { background:#0f1115; color:#e5e7eb; font-family: system-ui, sans-serif; padding:32px; }
          pre { white-space: pre-wrap; background:#111827; padding:16px; border-radius:8px; border:1px solid #334155; }
        </style>
      </head>
      <body>
        <h1>Unable to load UI</h1>
        <p>The application started, but the renderer assets were not found.</p>
        <pre>${(message || '').toString()}</pre>
      </body>
    </html>
  `)}`;
	try
	{
		await win.loadURL(html);
	} catch (_)
	{
		// ignore
	}
}

function resolvePreloadPath()
{
	const candidates = [
		// When main.js is packaged alongside preload.js
		path.join(__dirname, 'preload.js'),
		// When main.js remains under src/ in the asar
		path.join(__dirname, 'src', 'preload.js'),
		// Fallbacks relative to app path or executable
		path.join(app.getAppPath(), 'preload.js'),
		path.join(app.getAppPath(), 'src', 'preload.js'),
		path.join(path.dirname(process.execPath), 'preload.js'),
		path.join(path.dirname(process.execPath), 'src', 'preload.js')
	];
	for (const candidate of candidates)
	{
		try
		{
			if (fs.existsSync(candidate)) return candidate;
		} catch (_)
		{
			// ignore
		}
	}
	return null;
}

async function ensureWindow()
{
	if (mainWindow) return;
	await createMainWindow();
}

function generateSecret()
{
	try
	{
		return crypto.randomBytes(32).toString('hex');
	} catch (_)
	{
		return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
	}
}

async function ensureEnvFile(preferredPath, dataDir)
{
	try
	{
		// Prefer an .env shipped next to the executable (electron-builder extraFiles -> .env)
		if (fs.existsSync(preferredPath))
		{
			return preferredPath;
		}
	} catch (_) { }

	// If not present, create one under data/.env so it's writable and persists across runs
	const dataEnv = path.join(dataDir, '.env');
	try
	{
		if (!fs.existsSync(dataDir))
		{
			fs.mkdirSync(dataDir, { recursive: true });
		}
		// Copy template .env.example into data dir for user reference if exists next to exe
		try
		{
			const templateSrc = path.join(path.dirname(process.execPath), '.env.example');
			const templateDst = path.join(dataDir, '.env.example');
			if (fs.existsSync(templateSrc) && !fs.existsSync(templateDst))
			{
				fs.copyFileSync(templateSrc, templateDst);
			}
		} catch (_) { }
		if (!fs.existsSync(dataEnv))
		{
			const secret = generateSecret();
			const content = `# Auto-generated at first run\nJWT_SECRET=${secret}\nAPP_PUBLIC_APP_NAME=Task Management\n`;
			fs.writeFileSync(dataEnv, content, 'utf8');
		}
		return dataEnv;
	} catch (_)
	{
		// As a last resort, return preferredPath; backend will likely fail and surface error page
		return preferredPath;
	}
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () =>
{
	if (process.platform !== 'darwin')
	{
		app.quit();
	}
});

app.on('activate', () =>
{
	if (BrowserWindow.getAllWindows().length === 0)
	{
		createMainWindow();
	}
});

app.on('will-quit', async () =>
{
	await backend?.stop?.();
});
