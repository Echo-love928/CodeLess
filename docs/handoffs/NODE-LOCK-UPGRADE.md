# Node 锁定升级 24.16.0 → 24.22.1（ADR-005 维护者变更）

2026-10-22，Asia/Tokyo。按 ADR-005 单独提交的工具链升级：只改 Node 锁定，其他锁定（pnpm 12.6.0、Java 21、Spring Boot 4.1.1、
Spring AI BOM 2.0.1、Maven 3.9.11、Playwright 1.60.0）和所有锁文件不变。CI、根 `package.json` 与 ADR-005 归登记维护者管理，
本变更需要维护者确认；作者不自批、不合并、不推 main，也没有改动任何服务器。

## 1. 原因与版本选择

- 2026-10-22（D20-A 期间）用户拒绝下载 24.16.0，原话为“24.16.0有严重漏洞，需要使用最新的nodejs”。本机 `F:\nodejs\node.exe` 已是 v24.22.1。
  旧锁定使本机 `verify:static` 停在版本检查，凡经 `tests/agent/prepare-runtime.mjs` 准备运行时的 API 套件都在准备阶段失败，本机门禁无法如实运行。
- 24.16.0 之后，Node 24 线已有 3 个安全发布：24.17.0（2026-06-18，11 个 CVE，2 个 High）、24.18.1（2026-07-29，11 个，3 个 High）、
  24.22.1（2026-10-21，8 个，5 个 High）。合计 30 个 CVE：10 个 High、13 个 Medium、7 个 Low（逐条见 release-verification.json）。
- 与用户确认后选 **24.22.1**，没有选当天最新的 26.12.1。24.22.1 是 Node 24 LTS “Krypton” 的最新安全发布，维护期到 2028-04-30，与原锁定同一大版本。
  26.12.1 来自同一次安全发布，但仍是 Current（2026-10-28 才进入 LTS），属于大版本升级。仍为精确版本，不用 `latest` 或版本区间。

## 2. 改动清单（提交 `aa1301a`）

| 位置 | 改动 |
| --- | --- |
| `package.json`、`apps/web/package.json` | `engines.node` → `24.22.1`（`verify-versions.mjs` 以根 engines 为准） |
| `templates/vue/package.json` | 生成应用模板 `engines.node` → `24.22.1`。导出包 README 的 `{{NODE_VERSION}}` 与模板摘要随之更新，模板依赖不变 |
| `infra/build-image/verify-dependencies.mjs` | 构建镜像内的模板工具链检查 → `24.22.1` |
| `infra/build-image/Dockerfile` | `FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`（多平台索引摘要；原为 `2c87ef9b…a203`） |
| `scripts/verify-versions.mjs` | CI 锁定标记 → `node-version: 24.22.1` |
| `.github/workflows/ci.yml` | 全部 5 个 `actions/setup-node` 步骤 → `node-version: 24.22.1` |
| `.github/scripts/prepare-chromium.mjs` | Linux CI 环境守卫 → `v24.22.1` |
| `tests/agent/prepare-runtime.mjs` | API 套件运行时准备守卫（“D01 Node version required”）→ `v24.22.1` |
| `infra/hosting/preflight.mjs` | 托管预检要求 `CODELESS_NODE_EXECUTABLE` 报告 `v24.22.1` |
| `infra/compose.dev.yml`、`services/runner/src/publish/probe.mjs`、`tests/e2e/deploy/hosting.acceptance.mjs` | `node:24.22.1-bookworm-slim`（保持原来的仅标签形式，只改版本） |
| `infra/public/bootstrap-host.sh` | 下载 `node-v24.22.1-linux-x64`，按同目录官方 SHASUMS256 校验后解压 |
| `infra/public/worker.py`、`worker-client.py`、`run-acceptance.py`、`check-worker-cancel.py`、`host-preflight.sh`、`codeless-preview.service` | 运行时路径 → `/opt/codeless/tools/node-v24.22.1-linux-x64` |
| 文档 | README（锁定表、前置条件、`node --version`）、ADR-005 升级记录、`docs/environment.md`、`admin-usage.md`、`security-runner.md`、`ui-spec.md`、`infra/hosting/README.md`、`infra/preview/README.md`，以及 generation/selector/visual-edit/edit-scope/export/versions 六个测试 README 的运行环境说明 |

除本次升级自身的说明（README 锁定表、ADR-005、本交接与 `docs/evidence/node-lock/`）外，`git grep 24.16.0` 剩余的都是带日期的历史记录，保持原样：
`docs/evidence/**`、`tests/**/evidence/**`、`docs/handoffs/**`、`PR-DRAFT.md`、`review-*.md`、D15 部署计划与 2026-10-17 服务器准备记录。它们记录的是当时实际使用的版本。README 中“Playwright 1.60.0 修复旧安装器与 Node 24.16
兼容问题”是 Playwright 锁定的历史原因，也保持不变。`apps/web` 的 `@types/node` 22.13.14 只是类型定义，不属于运行时锁定，未改。

## 3. 身份核验

公开记录：[release-verification.json](../evidence/node-lock/2026-10-22/release-verification.json)（由下载的原始文件生成，未手抄）。

- `SHASUMS256.txt.asc`：签名有效，签名密钥 `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`（Antoine du Hamel），在 nodejs/release-keys 的 `keys.list` 中。
  验证在只导入该列表 29 个密钥的临时 GNUPGHOME 中进行，未触碰用户密钥环。签名正文与下载的 SHASUMS256.txt 只差末尾一个空行。
- 本机 `F:\nodejs\node.exe` 的 SHA-256 等于官方 `win-x64/node.exe`：`d702daa8…40e5`。运行时报告 OpenSSL 3.5.9、undici 7.30.1、c-ares 1.34.9，与安全发布说明一致。
- 公网主机使用的 `node-v24.22.1-linux-x64.tar.xz` 官方 SHA-256 为 `6c172a9a…95e6`；`bootstrap-host.sh` 安装时仍会按 SHASUMS256 重新校验。
- 镜像：`docker buildx imagetools inspect --raw` 得到的索引字节的 SHA-256 正是 `55fb5f5a…d205`，与 Docker Hub 一致。amd64 清单 `2dd9a4f7…81ae`，
  来源 nodejs/docker-node@`80f02a5`，基础镜像 `debian:bookworm-slim`。按摘要拉取后，容器内为 v24.22.1 x64、OpenSSL 3.5.9、undici 7.30.1、c-ares 1.34.9、corepack 0.36.0、Debian 12.15。

## 4. 本机兼容性证据

环境：Windows 11 22621（`core.autocrlf=true` 检出）、Node v24.22.1（`F:\nodejs`）、pnpm 12.6.0（Corepack）、Temurin 21.0.12.1、Docker 29.9.2。
模型固定 deterministic-mock，并清除模型 key/name 与浏览器 channel（`.local-data/node-lock/env.sh`，与 D18-A 至 D20-A 相同）。
公开摘要：[gate-summary.json](../evidence/node-lock/2026-10-22/gate-summary.json)、[gate-excerpt.txt](../evidence/node-lock/2026-10-22/gate-excerpt.txt)，均由原始日志生成。
完整日志在私有目录 `.local-data/node-lock/gate-2026-10-22T07-38-34Z/gate.log`（sha256 `b5411122…0afb`）。

`corepack pnpm ci:gate` @`aa1301a`（干净的已提交树，2026-10-22T07:38:36Z–07:58:56Z），native **1**：

| 阶段 | 结果 |
| --- | --- |
| `pnpm verify:static` | 通过。版本检查输出 `Node 24.22.1, pnpm 12.6.0`（升级前本机就停在这一步）；契约 18/18；web vitest 26 个文件 199/199；lint、类型检查与生产构建均通过。 |
| `pnpm verify:api` | **失败**（exit 1）：62 个测试类共 285 项，5 failure、0 error、0 skip，5 个全部是 `PreviewAcceptanceProcessTest`（见下）。经 `prepare-runtime.mjs` 准备运行时的 10 个套件（准备时会按新摘要 `docker build` 构建镜像）全部实际运行并通过，共 81 项：AgentLoop 11、CsrfDuringGeneration 1、RepairLoop 21、Publication 7、EditLifecycle 15、EditVerification 7、LocalEditScope 8、SourceExport 5、PreviewPlatform 1、VersionHttp 5。 |
| `pnpm verify:runner` | 通过：101/101。 |
| `pnpm verify:e2e` | 通过：Playwright 75/75（1.1 分钟），包括使用 `node:24.22.1-bookworm-slim` 探针容器的 D15-B 真实托管用例。 |
| `ci-gate` | 本机未全绿：第一个非零阶段是 verify:api，失败只有下述已知 5 项。这里不写 success，以 PR 的远端检查为准。 |

**已知的本机 Windows 失败（单独列出）**：`PreviewAcceptanceProcessTest` 8 项中有 5 项失败：
`interruptionStopsTreeAndRetainsInterrupt:30->stopped:18 [root stopped]`、`parentExceptionIsNotReplacedByCleanup:25->stopped:18 [root stopped]`、
`stopSignalWriteFailureStillReclaimsAndRunsProjectCleanup:50`、`timeoutAssertionAlwaysStopsRootBranchAndLeaf:24->stopped:18 [root stopped]`、
`unavailableProcessReportStillRunsProjectCleanupAndPreservesParent:38`。断言均为 “Expecting value to be false but was true”，即进程树清理后仍有进程被判定为存活。
失败名与断言行号，和 D19-A 在未修改的基线 `3ec4b99` 上用 **Node 24.16.0** 单独运行该类的记录逐行相同（私有日志 sha256 `3acd4a01…`）；D15-A 至 D19-A 的交接也都记录过同一组失败。
这个类会启动 `node` 进程树，所以确实与 Node 有关；升级前后失败签名不变，说明这次升级没有改变这组失败。远端 Linux 上它一直通过。没有修改、跳过或重试任何测试。

**附加检查**：
- 门禁前单独运行 `node scripts/verify-versions.mjs`：native 0。
- CI 独有的 `infra-preflight`（`bash infra/ci-preflight.sh .env.example`；compose 的 runner 已改为 `node:24.22.1-bookworm-slim`）：本机 native **0**，耗时 25 秒。Docker、PostgreSQL、三个网关与私有 runner 全部通过，compose 项目已 `down -v` 清理。

`verify:e2e` 重写了 9 张已提交截图：`docs/evidence/D10/deterministic/*` 4 张、`tests/e2e/versions/evidence/2026-10-12/fixture/*` 4 张，以及
`tests/e2e/share/evidence/2026-10-19/T2-mobile-placeholder.png`。它们已复制到 `.local-data/node-lock/gate-generated-png/`，再恢复为已跟踪的内容，不属于本变更。

## 5. 部署与使用注意

- **公网主机**：合并后、部署新的 `infra/public` 文件之前，运维需显式运行 `CODELESS_BOOTSTRAP_CONFIRM=install-tools infra/public/bootstrap-host.sh`。
  它会安装并校验 `/opt/codeless/tools/node-v24.22.1-linux-x64`；之后再安装 worker 与 service 文件，并重启 `codeless-preview` 和 worker。
  如果先部署 worker/service，新路径还不存在，这些进程会启动失败，不会回退到旧版本。旧的 24.16.0 目录可在切换后删除。本 PR 没有操作任何服务器。
- **托管预检**：`CODELESS_NODE_EXECUTABLE` 必须指向 24.22.1，否则 `infra/hosting/preflight.mjs` 失败关闭。
- **构建镜像**：运行时按固定标签 `codeless-vue-build:d05` 使用预先构建的镜像（`services/runner/src/template/build.mjs`、`infra/runner/policy.mjs`），本 PR 不改标签。
  因此每台运行构建的主机都要按 `infra/runner/README.md`（或 `infra/build-image/build-image.ps1`）重新 `docker build`，否则生成应用会继续在旧的 24.16.0 基础镜像里构建。
  测试与 `tests/agent/prepare-runtime.mjs` 每次都会重新执行 `docker build`，不受影响。
- **开发者**：本机需要安装 Node 24.22.1，否则 `verify:versions`、`verify:static` 及运行时准备会按设计失败。
- 回退：还原本 PR 的提交即可；没有数据、迁移或契约变化。

## 6. 维护者确认与合并条件

CI 工作流、根 `package.json` 与 ADR-005 由登记维护者负责：请维护者确认版本选择与改动清单。
以本 PR 最新 HEAD 的远端检查（ci-gate=success）和维护者批准为准；作者不自批，不合并。
