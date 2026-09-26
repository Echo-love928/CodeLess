import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const wrapper = isWindows ? 'services\\api\\mvnw.cmd' : 'services/api/mvnw';
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : wrapper;
const args = isWindows
  ? ['/d', '/c', wrapper, '-f', 'services/api/pom.xml', 'verify']
  : ['-f', 'services/api/pom.xml', 'verify'];
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
