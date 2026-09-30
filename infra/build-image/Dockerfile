FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203

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
