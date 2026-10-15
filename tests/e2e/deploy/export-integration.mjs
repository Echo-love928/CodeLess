import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const output = 'tests/e2e/deploy/evidence/integration-2026-10-15'
await mkdir(output, { recursive: true })
const paths = [
  '.local-data/d15-integration/2026-10-15T07-02-37.017Z-acceptance/run.json',
  '.local-data/d15-b/2026-10-15T07-02-37.827Z-static/run.json',
  '.local-data/d15-b/2026-10-15T07-04-10.735Z-runner/run.json',
  '.local-data/d15-b/2026-10-15T07-04-10.363Z-e2e/run.json',
  '.local-data/d15-b/2026-10-15T07-06-39.371Z-e2e/run.json',
]
const commands = []
for (const path of paths) {
  const run = JSON.parse(await readFile(path, 'utf8')), logPath = path.replace('run.json', 'command.log')
  const log = await readFile(logPath)
  if (sha(log) !== run.logDigest || !Number.isInteger(run.exitCode)) throw new Error('incomplete or changed command log')
  commands.push({ ...run, privateLog: logPath, summary: log.toString().split(/\r?\n/)
    .filter(line => /Tests run:|Tests  |Test Files|ℹ tests|ℹ pass|ℹ fail|ℹ skipped|[0-9]+ passed|BUILD SUCCESS|BUILD FAILURE|Requiring @playwright\/test second time|No tests found/.test(line)) })
}
const configurationLog = await readFile('.local-data/d15-integration/final-config-test.log')
commands.push({ command: ['services/api/mvnw.cmd', '-f', 'services/api/pom.xml', '-Dtest=PublicationGatewayConfigurationTest', 'test'],
  exitCode: Number((await readFile('.local-data/d15-integration/final-config-test.exit', 'utf8')).trim()),
  privateLog: '.local-data/d15-integration/final-config-test.log', logDigest: sha(configurationLog),
  summary: configurationLog.toString().split(/\r?\n/).filter(line => /Tests run:|BUILD SUCCESS|BUILD FAILURE/.test(line)) })
commands.push(...JSON.parse(await readFile('.local-data/d15-integration/resource-checks.json', 'utf8')))
await writeFile(join(output, 'commands.json'), JSON.stringify(commands, null, 2))
await copyFile('.local-data/d15-integration/a-import.json', join(output, 'a-source-import.json'))
await copyFile('.local-data/d15-integration/2026-10-15T07-02-37.017Z-acceptance/deploy/installed-A-B-gateway.json', join(output, 'installed-A-B-gateway.json'))
await copyFile('.local-data/d15-b/2026-10-15T07-06-39.371Z-e2e/hosting/acceptance.json', join(output, 'local-https-acceptance.json'))
await writeFile(join(output, 'status.json'), JSON.stringify({
  aHead: '4ea141a8c51b38c54eb330fc0d25c36b7042e102', bHead: '33b3b603a46dc0554a3491b30da4e175c0e49168',
  base: '572304e0cc21fbfe2e22cf7c286b4c3f29ad1013', gatewayInstalled: true, sharedOpenApiRegistered: true,
  fullApiLocal: 'NOT_RUN_THIS_INTEGRATION', exactHeadCi: 'READ_CURRENT_INTEGRATION_PR_CHECKS', publicMilestoneReached: false,
  publicBlocker: 'No supplied server access or real platform/preview/publication DNS/TLS configuration. Resource preflight native2.',
  note: '13 Java tests and local TLS are bounded integration evidence; no fixture or readiness check is public success.'
}, null, 2))
const sources = [], files = [
  'contracts/openapi.v0.json', 'contracts/deploy/README.md', 'scripts/run-static.mjs',
  'services/api/src/main/resources/application.yml', 'docs/handoffs/D15-integration.md',
  'tests/deploy/contracts.test.mjs', 'tests/infra/publication-config.test.mjs', 'tests/e2e/deploy/export-integration.mjs',
  'infra/hosting/README.md', 'infra/hosting/preflight.mjs', 'infra/hosting/prepare.mjs', 'infra/hosting/publication.env.example',
]
for (const directory of ['services/api/src/main/java/dev/codeless/api/deploy', 'services/api/src/test/java/dev/codeless/api/deploy'])
  for (const file of await readdir(directory)) if (file.endsWith('.java')) files.push(join(directory, file).replaceAll('\\', '/'))
for (const path of files.sort()) sources.push({ path, lfDigest: sha(Buffer.from((await readFile(path, 'utf8')).replaceAll('\r\n', '\n'))) })
await writeFile(join(output, 'source-digests.json'), JSON.stringify(sources, null, 2))
const artifacts = []
for (const name of await readdir(output)) if (name !== 'artifact-digests.json') {
  const bytes = await readFile(join(output, name)); artifacts.push({ path: name, bytes: bytes.length, digest: sha(bytes) })
}
await writeFile(join(output, 'artifact-digests.json'), JSON.stringify(artifacts, null, 2))
console.log(JSON.stringify({ output, commands: commands.length, sources: sources.length, artifacts: artifacts.length }))
