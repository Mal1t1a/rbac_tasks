const DEFAULT_PUBLIC_PREFIX = 'APP_PUBLIC_';

function loadPublicEnv(env = process.env, prefix = DEFAULT_PUBLIC_PREFIX) {
  const result = {};
  Object.keys(env || {}).forEach((key) => {
    if (key.startsWith(prefix)) {
      result[key] = env[key];
    }
  });
  return result;
}

module.exports = {
  DEFAULT_PUBLIC_PREFIX,
  loadPublicEnv
};
