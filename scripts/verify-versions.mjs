import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedNode = pkg.engines.node;
const expectedPnpm = pkg.engines.pnpm;
const actualNode = process.versions.node;
const isWindows = process.platform === 'win32';
const corepack = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
const corepackArgs = isWindows ? ['/d', '/c', 'corepack', 'pnpm', '--version'] : ['pnpm', '--version'];
const actualPnpm = execFileSync(corepack, corepackArgs, { encoding: 'utf8' }).trim();

const failures = [];
if (actualNode !== expectedNode) failures.push(`Node expected ${expectedNode}, got ${actualNode}`);
if (actualPnpm !== expectedPnpm) failures.push(`pnpm expected ${expectedPnpm}, got ${actualPnpm}`);

const lockedFiles = [
  ['services/api/pom.xml', ['<java.version>21</java.version>', '<version>4.1.1</version>', '<spring-ai.version>2.0.1</spring-ai.version>']],
  ['services/api/.mvn/wrapper/maven-wrapper.properties', ['apache-maven/3.9.11/', 'distributionSha512Sum=03e2d65d']],
  ['.github/workflows/ci.yml', ['node-version: 24.16.0', 'java-version: 21']],
  ['docs/architecture.md', ['Spring Boot 4.1.1', 'Spring AI BOM 2.0.1', 'Maven 3.9.11']]
];
for (const [path, markers] of lockedFiles) {
  const content = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  for (const marker of markers) {
    if (!content.includes(marker)) failures.push(`${path} is missing locked marker: ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`version check passed: Node ${actualNode}, pnpm ${actualPnpm}; Java/Spring/Maven locks consistent`);
