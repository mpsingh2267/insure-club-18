const fs = require('fs');
const path = require('path');

// Load web/.env (SESSION_SECRET, Supabase sign-in, ...) when present.
// Skipped for tests so a test run never syncs into the real cloud project.
const envFile = path.join(__dirname, '.env');
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const { start } = require('./src/server');

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Insure Club 18 failed to start:', error.message);
  process.exitCode = 1;
});
