# Controlled Vue template

The build image owns `package.json`, `pnpm-lock.yaml`, `index.html`, `vite.config.ts`,
`tsconfig.json`, `src/main.ts`, `src/App.vue`, and `src/router.ts`. Generated input
may only contain `src/pages/*.vue`, `src/components/*.vue`, and `src/data/*.ts`.
It cannot replace the entrypoint, routes, scripts, lockfile, or dependency set.

The fixed router exposes `/`, `/tasks`, and `/catalog`. Every build uses the
same three page slots. A generated app can populate any of these slots with
static data, explicit mock data, or browser LocalStorage.

`infra/build-image/build-image.ps1` builds the trusted image while online.
`node services/runner/src/template/build.mjs <source-dir> <output-dir>` then
validates generated files and builds with Docker `--network none`. The runner
service does not receive a Docker socket: this command is for a trusted host
build worker until the runner orchestration contract is wired up.
