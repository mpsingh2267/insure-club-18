const { start } = require('./src/server');

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Insure Club 18 failed to start:', error.message);
  process.exitCode = 1;
});
