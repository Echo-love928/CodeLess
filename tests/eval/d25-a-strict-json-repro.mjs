// Reproduce the recorded duplicate-key rejection without Node's permissive duplicate-key parsing.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { javaHome } from '../../scripts/eval/run-batch.mjs'
import { root, sha256, canonical } from '../../scripts/eval/lib.mjs'
const [input, output] = process.argv.slice(2), dir = join(root, '.local-data/d25-a/strict-json-repro')
mkdirSync(dir, { recursive: true })
const env = { ...process.env, JAVA_HOME: javaHome() }
for (const key of Object.keys(env)) if (/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key)) delete env[key]
const classpath = join(dir, 'classpath.txt')
const win = process.platform === 'win32'
const maven = ['-f', 'services/api/pom.xml', 'org.apache.maven.plugins:maven-dependency-plugin:3.10.0:build-classpath', '-DincludeScope=test', '-Dmdep.outputFile=' + classpath]
const prepared = spawnSync(win ? env.ComSpec ?? 'cmd.exe' : './services/api/mvnw', win ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...maven] : maven, { cwd: root, env, windowsHide: true })
writeFileSync(join(dir, 'classpath.log'), prepared.stdout ?? '')
assert.equal(prepared.status, 0, 'classpath preparation failed; inspect private log')
const command = [join(env.JAVA_HOME, 'bin/java'), '--class-path', readFileSync(classpath, 'utf8').trim(), 'tests/eval/D25StrictJsonReplay.java', resolve(input)]
const result = spawnSync(command[0], command.slice(1), { cwd: root, env, windowsHide: true })
writeFileSync(join(dir, 'replay.log'), Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]))
assert.equal(result.status, 0, 'strict parser replay failed; inspect private log')
assert.equal(result.stdout.toString().trim(), 'DUPLICATE_KEY_REJECTED')
const value = { task: 'D25-A', input, inputSha256: sha256(readFileSync(input)), parser: 'Jackson STRICT_DUPLICATE_DETECTION + FAIL_ON_TRAILING_TOKENS (AgentModel options)',
  classpathExitCode: prepared.status, replayExitCode: result.status, observed: 'DUPLICATE_KEY_REJECTED', additionalModelRequests: 0,
  sourceSha256: sha256(readFileSync(join(root, 'tests/eval/D25StrictJsonReplay.java'))), privateLog: '.local-data/d25-a/strict-json-repro/replay.log' }
writeFileSync(output, canonical(value), { flag: 'wx' }); console.log(canonical(value))
