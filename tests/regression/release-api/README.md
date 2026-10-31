# D26-A 限定回归

当前结论 **HOLD**。平台代码候选 `3286dd3`，基线 `df6822e`；全部命令、原生退出和证据边界见 `docs/handoffs/D26-A.md`。原完整 ci-gate=1，runner276/285；独立映射15/15不替代失败门禁。

从仓库根执行（锁定Node24.22.1、pnpm12.6.0、Java21、Maven3.9.11，需真实Docker与已锁定Chromium）：

```text
node tests/regression/release-api/freeze.mjs check
node tests/regression/release-api/record.mjs boundaries
node tests/regression/release-api/record.mjs cover-green
node tests/regression/release-api/record.mjs affected
node tests/regression/release-api/record.mjs gate
```

记录器仅开放固定命令，剥离模型凭据、使用deterministic-mock；真实数据库/工具/Docker/Vue/Chromium由原测试执行。`static`复验原静态入口；`mapping-diagnostic`仅诊断原映射入口，不能登记完整runner成功。完整日志和JUnit XML在 `.local-data/d26-a/commands/<时间戳>/`，公开回执提供SHA256和原生结果。`evidence/**`按原字节存储，失败日志空白不改写。

复现代码修复前失败：在独立检出 `df6822e` 中只加入 `3286dd3` 的 `services/api/src/test/java/dev/codeless/api/cover/D26CoverCoordinatorTest.java`，运行 `services/api/mvnw.cmd -f services/api/pom.xml -Dtest=D26CoverCoordinatorTest test`（非Windows使用mvnw）。原结果是3项中1失败，cursor.json不应存在却存在，见 **`2026-10-31T10-22-15.092Z-cover-red`**。在修复后的源码执行同一测试为3/3；记录器的`cover-red`模式只选择测试，不自动切换源码，必须核对回执HEAD和源摘要。

冻结检查使用当前工作区实际文件字节，并包含全部契约（含OpenAPI外部封面schema）和API执行适配器；这是本机执行快照。跨平台换行差异应按Git blob及实际运行时字节核查后重新审查冻结，不能手改摘要将未知变化登记为成功。204文件最终冻结、140文件原代码候选冻结和原起点冻结分别保留。

模型质量、原机公网/生产capture、自然REAL FAILED编辑、双方最终组合联调均不由这些fixture证明；既有6/9、13/14及原失败保持。不要部署、启用或复位原队列来让报告变绿。
