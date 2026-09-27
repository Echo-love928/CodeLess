# CodeLess

CodeLess 是面向受控试用的自然语言前端应用生成平台。首版只生成受控模板中的 Vue 前端应用；生成应用只能使用静态数据、Mock 或 LocalStorage，不生成服务端代码。

## D01 冻结基线

| 工具/框架 | 锁定版本 |
| --- | --- |
| Java | 21 |
| Spring Boot | 4.1.1 |
| Spring AI BOM | 2.0.1 |
| Maven | 3.9.11（由 Wrapper 管理） |
| Node.js | 24.16.0 |
| pnpm | 12.6.0（由 Corepack 管理） |

版本与升级规则见 [docs/architecture.md](docs/architecture.md)，产品边界见 [docs/scope.md](docs/scope.md)，HTTP/JSON 契约入口见 [contracts/README.md](contracts/README.md)。D01 骨架不会加载模型 provider，也不需要模型凭据。

## 从空目录启动后端

前置条件：Git、Java 21，以及可访问 Maven Central 的网络。

```bash
git clone <repository-url> codeless
cd codeless
./services/api/mvnw -f services/api/pom.xml spring-boot:run
```

Windows PowerShell：

```powershell
.\services\api\mvnw.cmd -f services\api\pom.xml spring-boot:run
```

启动后访问 `GET http://localhost:8080/api/health`，应返回 `status: "UP"`。

## 启动前端

前置条件：Node.js **24.16.0** 与 Corepack。所有依赖由仓库根目录的 workspace 和 `pnpm-lock.yaml` 管理，`apps/web` 不再维护独立锁文件。

先在仓库根目录准备 pnpm shim，再安装依赖：

```bash
corepack enable pnpm
node --version          # v24.16.0
pnpm --version          # 12.6.0，由 packageManager 声明选择
pnpm install --frozen-lockfile
pnpm --filter @codeless/web dev
```

Windows 若 Node 安装目录不可写，或 `pnpm` 被其他安装的可执行文件抢先解析，可在当前 PowerShell 会话使用用户目录中的 Corepack shim：

```powershell
$shimDir = Join-Path $env:LOCALAPPDATA 'codeless-corepack-shims'
New-Item -ItemType Directory -Force $shimDir | Out-Null
corepack enable --install-directory $shimDir pnpm
$env:Path = "$shimDir;$env:Path"
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @codeless/web dev
```

默认访问 `http://127.0.0.1:5173/login`。登录、应用列表和工作台当前使用本地演示数据；真实鉴权、生成和发布尚未接入。启动步骤应先完成 shim 准备，因为前端脚本及 Playwright 会继续调用 `pnpm`。

## 验证

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm ci:gate
```

阶段入口均执行真实检查：

- `pnpm verify:static`：锁定工具版本、OpenAPI 与 JSON Schema/fixture，以及前端 lint、单测、类型检查和生产构建。
- `pnpm verify:api`：Java 编译、API 测试与打包。
- `pnpm verify:runner`：runner 安全边界所依赖的构建契约检查；真实 runner 尚未实现。
- `pnpm verify:e2e`：跨资源生命周期契约检查，以及前端三页的 Playwright 浏览器冒烟；尚不覆盖真实生成、保存和发布。

Linux CI 使用 Ubuntu 24.04，通过 `pnpm exec playwright install --with-deps chromium` 安装 Playwright 1.60.0 配套的 Chromium。该 Playwright 版本修复了旧安装器与 Node 24.16 的兼容问题。Windows 也可使用已安装的 Chrome：先设置 `$env:CODELESS_PLAYWRIGHT_CHANNEL='chrome'` 再执行门禁。API 门禁还要求 `JAVA_HOME` 指向 Java 21。

可用 `CODELESS_FORCE_FAIL=verify:runner pnpm ci:gate` 验证任一子检查失败时汇总门禁非零退出。该注入仅用于门禁自测。

## 仓库结构

```text
apps/web/             平台界面
services/api/         Java 业务与 Agent 服务
services/runner/      构建、验证、预览与发布执行
templates/vue/        受控生成模板
contracts/            公共契约
prompts/runtime/      平台运行时提示词
tests/e2e/            真实浏览器业务流程测试
tests/security/       安全测试
evals/                生成与浏览器编辑评估
infra/                基础设施配置
scripts/              开发与维护脚本
docs/                 项目文档
.github/workflows/     CI 工作流
```
