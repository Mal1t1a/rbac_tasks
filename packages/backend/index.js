const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { EventEmitter } = require('events');

const { initDatabase, getUserById, setCurrentSession, getCurrentSession } = require('./lib/database');
const { loadPublicEnv } = require('./lib/environment');
const { createAuthMiddleware } = require('./lib/auth');
const { createAuditLogger } = require('./lib/audit');
const { createAuthRouter } = require('./routes/auth');
const { createTaskRouter } = require('./routes/tasks');
const { createCategoryRouter } = require('./routes/categories');
const { createAuditRouter } = require('./routes/audit');
const { createSystemRouter } = require('./routes/system');
const { createUserRouter } = require('./routes/users');
const { createSessionRouter } = require('./routes/session');
const { createSettingsRouter } = require('./routes/settings');
const { createWelcomeRouter } = require('./routes/welcome');
const { createAdminRouter } = require('./routes/admin');

function createBackendServer(options = {}) {
  const cwd = options.cwd || process.cwd();
  const envPath = options.envPath || path.join(cwd, '.env');
  dotenv.config({ path: envPath });
  const env = process.env;

  const dataDir = options.dataDir || path.join(cwd, 'data');
  const emitter = new EventEmitter();
  const dbApi = initDatabase(dataDir, options.databaseFile);
  const envConfig = loadPublicEnv(env, options.envPrefix);

  const app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', env.APP_ALLOWED_ORIGIN || 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
  app.use(express.json());

  const state = {
    port: null
  };

  const auditLogger = createAuditLogger(dbApi);
  const authenticate = createAuthMiddleware({ env, dbApi });

  app.use('/system', createSystemRouter({ envConfig, getPort: () => state.port }));
  app.use('/auth', createAuthRouter({ env, dbApi, auditLogger }));

  const apiRouter = express.Router();
  apiRouter.use(authenticate);
  apiRouter.use('/', createUserRouter());
  apiRouter.use('/session', createSessionRouter({ auditLogger, dbApi }));
  apiRouter.use('/settings', createSettingsRouter({ envPath, auditLogger }));
  apiRouter.use('/tasks', createTaskRouter({ dbApi, auditLogger }));
  apiRouter.use('/categories', createCategoryRouter({ dbApi, auditLogger }));
  apiRouter.use('/audit-log', createAuditRouter({ dbApi }));
  apiRouter.use('/welcome', createWelcomeRouter({ dbApi, auditLogger }));
  apiRouter.use('/admin', createAdminRouter({ dbApi, auditLogger }));

  app.use('/api', apiRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error('Backend error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const preferredPort = Number(env.PORT) || 10469;
  const targetPort = options.port || preferredPort;

  function startServer() {
    const server = app.listen(targetPort, () => {
      state.port = server.address().port;
      emitter.emit('server:started', { port: state.port });
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && targetPort === preferredPort && !options.port) {
        const fallbackServer = app.listen(0, () => {
          state.port = fallbackServer.address().port;
          emitter.emit('server:started', { port: state.port });
        });
        fallbackServer.on('error', (fallbackError) => {
          emitter.emit('backend:error', { message: 'Failed to start server', details: fallbackError.message });
        });
        return fallbackServer;
      } else {
        emitter.emit('backend:error', { message: 'Failed to start server', details: error.message });
      }
    });

    return server;
  }

  const server = startServer();

  return {
    app,
    server,
    events: emitter,
    getPort: () => state.port,
    getPublicEnv: () => envConfig,
    getUserById: (id) => dbApi.getUserById(id),
    setCurrentSession: (userId, tokenExpiresAt) => dbApi.setCurrentSession(userId, tokenExpiresAt),
    getCurrentSession: () => dbApi.getCurrentSession(),
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
  };
}

module.exports = {
  createBackendServer,
  loadPublicEnv
};
