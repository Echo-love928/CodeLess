import { mkdirSync, readFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { environment, root, run, maven, windows } from './support.mjs'

export function prepare() {
  const lockedNode = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines.node
  if (process.version !== `v${lockedNode}`) throw new Error(`Locked Node ${lockedNode} required (package.json engines.node); got ${process.version}`)
  const env = environment(), build = join(root, '.local-data/d20-b/compiled')
  mkdirSync(build, { recursive: true })
  // Build current production classes and resolve its existing pinned dependencies.
  // The test composition is compiled separately and never enters the API JAR.
  maven(['-DskipTests', 'package', 'dependency:build-classpath', '-DincludeScope=runtime', '-Dmdep.outputFile=' + join(build, 'classpath.txt')], env)
  const classpath = [join(root, 'services/api/target/classes'), readFileSync(join(build, 'classpath.txt'), 'utf8').trim()].join(delimiter)
  run(join(env.JAVA_HOME, 'bin', windows ? 'javac.exe' : 'javac'), ['-encoding', 'UTF-8', '-cp', classpath, '-d', build, join(root, 'tests/e2e/full/FixtureApplication.java')], { env })
  run(process.execPath, ['tests/agent/prepare-runtime.mjs'], { env, stdio: 'inherit' })
  return { env, classpath: [build, classpath].join(delimiter) }
}
