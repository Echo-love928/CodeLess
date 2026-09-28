# D02 开发环境

## 版本与边界

沿用 D01 锁定的 Node 24.16.0、pnpm 12.6.0、Java 21、Maven 3.9.11。`infra/compose.dev.yml` 固定 PostgreSQL `17.6-alpine`（与 D02-A 测试使用同一摘要 `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`）、Nginx `1.27.5-alpine`、runner Node `24.16.0-bookworm-slim`。Nginx/Node 镜像固定版本标签，公网部署仍需核对镜像摘要。CI 使用仓库现有 Playwright 1.60.0。

Docker Compose 提供本机开发的 PostgreSQL、平台网关、预览网关、发布网关和独立 runner。四个宿主端口只绑定 `127.0.0.1`；runner 没有宿主端口，只有内部网络中的 `/internal/health`。预览和发布网关当前只提供健康检查，其他路径返回 404，待已验证不可变版本的交付链路接入后才开放内容。它们不是公网 DNS/TLS 或真实发布成功的证明。

## 配置

从仓库根目录复制 `.env.example` 为 `.env`。示例没有平台签名密钥或模型密钥，可以运行本卡的开发服务与门禁；`POSTGRES_PASSWORD=local-dev-only-change-me` 只供本机数据库使用，不能用于共享环境。平台密钥变量为 `CODELESS_PLATFORM_SIGNING_KEY`、`CODELESS_MODEL_API_KEY`；域名变量为 `CODELESS_PLATFORM_DOMAIN`、`CODELESS_PREVIEW_DOMAIN`、`CODELESS_PUBLICATION_DOMAIN`；存储目录变量为 `CODELESS_STORAGE_DIR`，目前为后续制品接入预留，runner 不挂载该目录。

`node infra/check-config.mjs .env` 检查数据库名、用户、密码、端口、D02-A 的 `CODELESS_DATABASE_URL/USER/PASSWORD`、三个域名、三个网关端口与存储目录，并拒绝缺失值、数据库连接配置不一致或端口冲突。平台密钥为空允许本卡服务启动；启用鉴权或真实模型 provider 时须由对应任务加入严格校验。不要将 `.env` 或本机存储目录提交到 Git。

## 启动与健康检查

需要 Docker Engine 与 Compose v2、Node 24.16.0 和 Corepack。在仓库根目录执行：

```bash
cp .env.example .env
node infra/check-config.mjs .env
docker info
docker compose --env-file .env -f infra/compose.dev.yml config --quiet
docker compose --env-file .env -f infra/compose.dev.yml up -d --wait
docker compose --env-file .env -f infra/compose.dev.yml exec -T postgres pg_isready -U codeless -d codeless
docker compose --env-file .env -f infra/compose.dev.yml exec -T runner node -e "fetch('http://127.0.0.1:8787/internal/health').then(async r => { console.log(r.status, await r.text()); if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
curl -H 'Host: platform.codeless.test' http://127.0.0.1:18080/health
curl -H 'Host: preview.codeless.test' http://127.0.0.1:18081/health
curl -H 'Host: publish.codeless.test' http://127.0.0.1:18082/health
```

PowerShell 中复制配置用 `Copy-Item .env.example .env`，HTTP 检查可用 `Invoke-RestMethod -Headers @{Host='platform.codeless.test'} http://127.0.0.1:18080/health`，其余命令不变。停止用 `docker compose --env-file .env -f infra/compose.dev.yml down`；只有明确要清除开发数据库时才加 `-v`。

平台网关把 `/api/` 转发到宿主机 `8080`，其余请求转发到宿主机 `5173`。先按 README 启动 API；合入 D02-A 后还需将 `.env` 的 `CODELESS_DATABASE_*` 三项加载到 API 进程环境。再以 `corepack pnpm --filter @codeless/web exec vite --host 0.0.0.0` 启动前端，随后检查 `http://127.0.0.1:18080/api/health`。网关将开发服务器的 Host 头设为 `localhost`，以满足 Vite 的主机校验。此本机配置不提供 TLS。前端开发服务器绑定所有本机接口仅供受信任的开发网络使用。

## 失败和隔离验收

清空 `POSTGRES_PASSWORD` 或删除 `CODELESS_PREVIEW_DOMAIN` 后，`node infra/check-config.mjs .env` 必须非零退出并列出缺失项；Compose 的 `${VAR:?}` 也拒绝缺失的必需服务变量。`RUNNER_HOST=0.0.0.0 node services/runner/main.mjs` 在未设置容器专用开关时必须非零退出。`docker compose ... port runner 8787` 不得返回宿主映射。健康响应固定为 `status` 和 `service`，不会读取密钥环境变量；`corepack pnpm verify:runner` 覆盖正常、失败和隔离路径。

CI 的 `infra-preflight` 实际运行 `bash infra/ci-preflight.sh .env.example`：校验配置，执行 `docker info`、Compose 配置、拉起固定镜像、PostgreSQL `SELECT 1`、三个网关健康检查、runner 内部健康检查和无宿主端口断言。它的结果纳入 `ci-gate`；任何失败、取消、跳过或未知结果都不能通过汇总门禁。本机缺少 Docker 时必须记录未执行，不能以静态测试替代。

## 排障

- `docker info` 失败：确认 Docker Engine 已启动且当前用户有权限；这也是 CI 的首个 Docker 预检。
- `node infra/check-config.mjs .env` 失败：按报错补全具体变量。不要为通过检查填入真实平台密钥到共享文件。
- Compose 报端口占用：更换 `.env` 中四个互不相同的本机端口；数据库仍仅绑定回环地址。
- 网关健康但页面 502：健康检查只说明 Nginx 启动。确认 API 在宿主机 `8080`、Vite 在 `5173` 且能从容器访问 `host.docker.internal`。
- runner 不健康：查看 `docker compose --env-file .env -f infra/compose.dev.yml logs runner`；服务只接受 `/internal/health`，默认禁止公网绑定。
- 预览/发布域名不可访问：`.test` 是本地示例域名，外部 DNS、TLS、独立站点与存储资源须由部署方配置；本任务不声称公网资源已到位。
