import { readFileSync } from 'node:fs'

const root = '/opt/codeless/template/'
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const allowed = JSON.parse(readFileSync(`${root}allowed-dependencies.json`, 'utf8'))
for (const key of ['dependencies', 'devDependencies']) {
  if (JSON.stringify(pkg[key]) !== JSON.stringify(allowed[key])) {
    throw new Error(`${key} differs from the reviewed allowlist`)
  }
}
if (pkg.engines?.node !== '24.16.0' || pkg.engines?.pnpm !== '12.6.0') {
  throw new Error('toolchain versions differ from D01 lock')
}
if (Object.keys(pkg.scripts ?? {}).join(',') !== 'build' ||
  pkg.scripts.build !== 'vue-tsc --noEmit && vite build --configLoader runner') {
  throw new Error('build script differs from the fixed entry')
}
console.log('reviewed Vue dependency allowlist and fixed build script verified')
