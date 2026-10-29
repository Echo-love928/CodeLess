# CodeLess

CodeLess 是面向受控试用的自然语言前端应用生成平台。登录后描述需求，生成受控 Vue 应用，查看真实构建和浏览器验证结果，再进行组件编辑、版本查看、截图、源码导出和显式发布。生成应用只使用静态数据、Mock 或 LocalStorage。

## 安装与演示

从全新目录开始请按 [安装指南](docs/install.md) 操作，包含 Windows PowerShell 与 bash、数据库、账号初始化、API/前端启动、Mock 全产品演示与真实模型请求。失败查 [排障指南](docs/troubleshooting.md)。

```sh
git clone https://github.com/Echo-love928/CodeLess.git codeless
cd codeless
corepack pnpm install --frozen-lockfile
node tests/e2e/full/record-command.mjs full
```

先准备下表工具、Docker Engine、Git OpenSSL（Windows），并把 Corepack pnpm shim 放在 PATH 首部，详见安装指南。该自动演示创建隔离数据库、运行迁移、启动 API/本地 HTTPS 站点并在 Chromium 执行业务，结束后清理本轮进程和容器。模型为 deterministic-mock，构建、数据库和浏览器真实执行；持续交互服务、公网部署和真实模型另行配置。

## 锁定版本

| 工具/框架 | 版本及来源 |
| --- | --- |
| Java | 21，services/api/pom.xml |
| Spring Boot / Spring AI BOM | 4.1.1 / 2.0.1，services/api/pom.xml |
| Maven | 3.9.11，仓库 Wrapper |
| Node.js / pnpm | 24.22.1 / 12.6.0，根 package.json |
| PostgreSQL | 17.6-alpine，Compose 与测试固定摘要 |
| Playwright | 1.60.0，根锁文件；使用配套 Chromium |

沿用 [ADR-005](docs/architecture.md) 与既有 Node 安全升级，不安装 latest、不重建锁文件。平台 workspace 使用根 pnpm-lock.yaml，生成项目使用 templates/vue/pnpm-lock.yaml，两者独立。

## 架构与范围

Vue + TypeScript 平台 UI 调用 Java/Spring API，PostgreSQL 保存账号、任务、版本与部署引用。模型提出 PLAN 与源码补丁，受限 Node/Docker runner 实际构建，Playwright 验证后才能形成 READY/VERIFIED 版本。失败保留最近可用版本，发布须由已鉴权用户显式触发。

```text
apps/web/         平台界面             services/api/       HTTP、鉴权、业务与 Agent
services/runner/  构建、验证、预览发布 templates/vue/      受控 Vue 模板
contracts/        HTTP/JSON 契约       tests/              集成、安全与浏览器验收
infra/            基础设施             docs/               架构、操作与每日交接
```

边界见 [scope](docs/scope.md)，决策见 [architecture](docs/architecture.md)，接口见 [contracts](contracts/README.md)。React、生成后端、支付、开放 shell、多 Agent 和任意依赖安装不在首版范围。生成容器不能得到平台密钥或宿主 Docker socket。

## 验证与源码交付

```sh
node --test tests/install/install.test.mjs
pnpm verify:static
pnpm verify:api
pnpm verify:runner
pnpm verify:e2e
pnpm ci:gate
```

static 检查版本、契约和前端 lint/单测/生产构建；api 执行 Maven verify；runner 执行真实隔离构建与边界检查；e2e 包含浏览器 smoke 和全产品链路。Docker、Java、依赖及配套 Chromium 必须可用。CI 的 infra-preflight 也必须成功，本机结果与最终 PR HEAD 的远端检查分别记录。

源码包从已验证版本下载，包含 README、锁文件和 codeless-export.json。解压到独立目录后按包内 README 安装构建；独立容器核验见 [安装指南](docs/install.md#源码包独立运行)。

## 团队与交接

成员 A 主责 API、模型与运维流程，成员 B 主责前端、runner 与交付体验；具体以每日契约和 docs/handoffs 为准。使用独立分支与 PR，由另一位成员审查，不自批、不直接推送 main。必需检查成功且讨论解决后才具备合并条件。D23-B 证据与外部阻塞见 [交接](docs/handoffs/D23-B.md)。
