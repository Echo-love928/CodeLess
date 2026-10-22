FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

WORKDIR /opt/codeless/template
COPY templates/vue/package.json templates/vue/pnpm-lock.yaml templates/vue/pnpm-workspace.yaml ./
COPY templates/vue/allowed-dependencies.json ./
COPY infra/build-image/verify-dependencies.mjs /opt/codeless/verify-dependencies.mjs
RUN node /opt/codeless/verify-dependencies.mjs
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate && corepack pnpm install --frozen-lockfile
COPY templates/vue/index.html templates/vue/tsconfig.json templates/vue/vite.config.ts ./
COPY templates/vue/src ./src
COPY infra/build-image/container-build.mjs /opt/codeless/container-build.mjs
ENV CI=1
ENTRYPOINT ["node", "/opt/codeless/container-build.mjs"]
