import { createRunnerServer, runnerListenOptions } from './health.mjs';

try {
  const options = runnerListenOptions();
  const server = createRunnerServer();
  server.on('error', (error) => {
    console.error(`runner failed to listen: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options, () => {
    console.log(`runner health listening on ${options.host}:${options.port}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
