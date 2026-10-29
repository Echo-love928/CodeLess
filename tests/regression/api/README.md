# D24-A API 请求体边界回归

固定 Node 24.22.1、pnpm 12.6.0、Java 21、Maven 3.9.11；沿用仓库版本，不安装或升级依赖。

```powershell
node tests/regression/api/record-body-boundary.mjs red
node tests/regression/api/record-body-boundary.mjs baseline-http
node tests/regression/api/record-body-boundary.mjs green
node tests/regression/api/record-body-boundary.mjs regression
node tests/regression/api/record-body-boundary.mjs gate
```

- `red` 是同一过滤器反例测试：修复前两项失败，修复后通过，不能期望修复后仍红。
- `baseline-http` 临时只将 AuthFilter 换为 `5a0f14d` 版本，同一真实 HTTP/PostgreSQL 测试应失败（400 vs 实际201）；finally 按字节恢复工作文件。仅在没有其他构建/编辑的独立任务 checkout 执行；原字节备份在本次 `.private/*baseline-http/original-AuthFilter.java`，进程被外部强制终止时先从该备份手动恢复，禁止用 Git checkout 覆盖未提交修改。
- `green`：有限读取/已知长度拒绝零读取、chunked、精确上限、Unicode、传输错误、认证/CSRF，以及真实 Tomcat/PostgreSQL 的无副作用、最坏转义8000字符兼容性。
- `regression`：既有安全矩阵、会话、版本、发布与队列测试；`gate` 串行运行仓库原始 static/api/runner/e2e，因而包含这些既有测试。执行完整 gate 后无需为凑数再重复 regression。
- 记录器只选择 `deterministic-mock` 并移除模型 key/name，回环地址不经代理；不改变 TLS、断言、隔离或依赖。gate 观察器仅记录每个原生命令退出码，不修改结果或跳过阶段。测试产生的既有截图按运行前字节保全，恢复列表和摘要写入证据。
- `evidence/*/command.json` 记录实际 HEAD、源码摘要、时间、退出码、日志摘要和本轮 JUnit 统计。原始日志与 XML 在 `.private/`，不公开环境/会话/模型输出；公开 summary 仅提取测试计数和断言，不将旧 Surefire 文件计入本轮。
- 新 JUnit `*Test` 自动纳入既有 `verify:api`，未改根入口或 CI。gate 需本机 Docker 和现有镜像；缺资源记失败，不替代真实数据库/构建/浏览器。

本卡模型边界测试不需要任何模型调用，不能拿它证明 D21 的真实模型生成/修复效果。完整门禁产生的 Mock 调用总数未知时记 UNKNOWN，不填0。
