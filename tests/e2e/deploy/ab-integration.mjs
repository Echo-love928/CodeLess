import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Read-only A source input, no checkout/merge/reset of either author's branch.
// This temporary composition tests the real A service with B's real stdio adapter.
const aCommit = '716abcd1ae5ad05fd75d780fc21734952326b98a'
const repo = resolve('.'), root = resolve('.local-data/d15-b/ab-' + Date.now())
mkdirSync(root, { recursive: true })
function run(command, args, timeout = 900000) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, CODELESS_B_REPOSITORY: repo },
    stdio: 'inherit', timeout, windowsHide: true })
  if (result.error || result.status !== 0 || result.signal) throw new Error(`A/B command failed: ${command} exit=${result.status} signal=${result.signal} error=${result.error?.message ?? ''}`)
}
const archive = join(root, 'a.tar')
const archived = spawnSync('git', ['archive', '--format=tar', '--output', archive, aCommit], { cwd: repo, stdio: 'inherit' })
if (archived.status !== 0) throw new Error('exact reviewed A source unavailable; fetch its branch first')
run('tar', ['-xf', archive, '--exclude=*/evidence/*'], 60000)
symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const source = join(root, 'services/api/src/main/java/dev/codeless/api/deploy/NodeDeploymentGateway.java')
copyFileSync(join(repo, 'services/runner/src/publish/java/NodeDeploymentGateway.java'), source)
const fixture = join(root, 'services/api/src/test/java/dev/codeless/api/deploy/PublicationIntegrationTest.java')
let java = readFileSync(fixture, 'utf8')
java = java.replace('final Map<UUID,Integer> publishes=', `final NodeDeploymentGateway bridge=new NodeDeploymentGateway(
            Path.of(System.getenv("CODELESS_NODE_EXECUTABLE")),
            Path.of(System.getenv("CODELESS_B_REPOSITORY"),"services/runner/src/publish/gateway-cli.mjs"),
            Path.of("target/b-bridge-sites"),"https://sites.codeless-public.test","https://app.codeless.test","https://preview.codeless-preview.test");
        final Map<UUID,Integer> publishes=`)
java = java.replace('if("UNAVAILABLE".equals(mode))', 'if("NODE".equals(mode)) return bridge.publish(payload,deadline);\n            if("UNAVAILABLE".equals(mode))')
java = java.replace('return switch(mode) {', 'if("NODE".equals(mode)) return bridge.probe(payload,url,deadline);\n            return switch(mode) {')
const extra = readFileSync(join(repo, 'tests/e2e/deploy/java/bridge-test.fragment.java'), 'utf8')
java = java.slice(0, java.lastIndexOf('}')) + extra + '\n}\n'
writeFileSync(fixture, java)
mkdirSync(join(root, 'services/api/target/b-bridge-sites'), { recursive: true })
writeFileSync(join(root, 'composition.json'), JSON.stringify({ aCommit, bRepository: repo,
  productionAChanged: false, productionBAdapter: source, fixtureOnly: 'Adds NODE test mode and order7 to unmodified A test cases; no assertions removed' }, null, 2))
process.env.CODELESS_NODE_EXECUTABLE = process.execPath
const windows = process.platform === 'win32'
run(windows ? process.env.ComSpec : './services/api/mvnw', windows
  ? ['/d', '/c', 'services\\api\\mvnw.cmd', '-f', 'services/api/pom.xml', '-Dtest=PublicationIntegrationTest', 'test']
  : ['-f', 'services/api/pom.xml', '-Dtest=PublicationIntegrationTest', 'test'])
console.log(JSON.stringify({ aCommit, compositionRoot: root, publicMilestoneReached: false }))
