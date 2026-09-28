import { createServer } from 'node:http';

const body = JSON.stringify({ status: 'UP', service: 'codeless-runner' });

export function createRunnerServer() {
  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url !== '/internal/health') {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      response.writeHead(405).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(body);
  });
}

export function runnerListenOptions(env = process.env) {
  const host = env.RUNNER_HOST || '127.0.0.1';
  const port = Number(env.RUNNER_PORT || '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('RUNNER_PORT must be an integer from 1 to 65535');
  }
  if (!['127.0.0.1', '::1'].includes(host) && !(host === '0.0.0.0' && env.RUNNER_CONTAINER_ONLY === '1')) {
    throw new Error('RUNNER_HOST must be loopback unless RUNNER_CONTAINER_ONLY=1 in an isolated container');
  }
  return { host, port };
}
