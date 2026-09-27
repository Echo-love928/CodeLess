# CodeLess v0 架构决策

## ADR-001：单一 Vue 生成策略

- **决定**：v0 只支持受控 Vue 模板，数据来源限静态数据、Mock 与 LocalStorage。
- **原因**：收窄依赖、构建与安全矩阵，使真实验证结果可解释。
- **后果**：契约中的模板固定为 `VUE`；其他框架请求必须被拒绝，而不是自动降级。

## ADR-002：真值驱动的任务状态机

任务按 `PLAN → GENERATE → VERIFY → REPAIR | READY` 推进，任何阶段也可进入 `FAILED`。模型只能提出计划或补丁；受限工具的退出码、构建产物摘要和浏览器断言才是状态依据。REPAIR 受运行时预算控制，失败不得覆盖最近可用版本。

## ADR-003：服务与执行隔离

- `apps/web`：Vue + TypeScript 平台 UI。
- `services/api`：Java/Spring HTTP、身份与业务编排；PostgreSQL 是平台数据源。
- `services/runner`：受限 Node/Docker/Playwright 执行面；不接受任意 shell/依赖，不挂宿主 Docker socket或平台密钥。
- 生成版本以内容摘要标识且不可变；发布记录只引用已验证版本。

## ADR-004：contract-first v0

`contracts/openapi.v0.json` 是 HTTP 接口入口；`contracts/schemas/v0` 是资源 JSON Schema 真值；`contracts/examples/v0` 同时提供合法和非法 fixture。v0 的破坏性变更必须开新版本，不能原地改变含义。

## ADR-005：兼容版本锁定

D01 锁定 Java 21、Spring Boot 4.1.1、Spring AI BOM 2.0.1、Maven 3.9.11、Node 24.16.0、pnpm 12.6.0。Spring AI 2.0.x 与 Spring Boot 4.0/4.1 同代；D01 骨架仅导入 BOM，不启用需要密钥的 provider。

`pom.xml`、Maven Wrapper、`package.json` 和 CI 必须保持这些版本一致。升级必须单独提交兼容性证据，不能使用 `latest`、版本区间或未锁定的 CI 工具链。

## ADR-006：初始门禁

根 `ci:gate` 串行执行 static、api、runner、e2e 四个阶段并保留第一个非零退出码。D01 的 runner/e2e 尚无实现，因此两者验证其真实前置契约和生命周期约束；它们不是浏览器或 runner 已完成的证明。相关实现落地时必须用真实构建/Playwright 测试替换或扩充。
