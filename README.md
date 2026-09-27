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

## 验证

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm ci:gate
```

阶段入口均执行真实检查：

- `pnpm verify:static`：锁定工具版本、OpenAPI 与 JSON Schema/fixture。
- `pnpm verify:api`：Java 编译、API 测试与打包。
- `pnpm verify:runner`：runner 安全边界所依赖的构建契约检查；真实 runner 尚未实现。
- `pnpm verify:e2e`：跨资源生命周期契约检查；真实浏览器 E2E 尚未实现。

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
