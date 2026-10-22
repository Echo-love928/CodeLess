任务ID：D20-A（成员A）／分支 `codex/d20-a-concurrency`／base `main = c5bec00`

## 问题与结果

- **触发场景**：版本列表、发布列表、发布详情与 READY 提交或发布 worker 提交并发。
- **修复前**：这三个接口用多条各自提交的语句拼一个响应。用测试专用 JDBC 语句闸门把提交精确放在两条语句之间，可确定复现：
  - 版本列表返回 `latestReadyVersionId=v3`，同一响应条目中 v3 却是 `DRAFT`；新草稿落在两条语句之间时 `total=4` 而条目只有 3 条。
  - 发布列表把某发布列为 `REQUESTED`，同时把它作为 `latestSuccessful`；发布详情 `publication.status=REQUESTED` 而 `latestSuccessful` 指向它自己。
- **修复后**：三个读取在一个只读 REPEATABLE READ 事务内完成（与 AdminQueries、TaskEventReplay、诊断接口既有做法一致），同一闸门下响应自洽；响应结构、状态码与权限不变。
- 写路径（同应用重复提交、取消与 READY 提交竞争、双用户同键、单次逻辑发布、并发修改期间发布旧版本）在真实 PostgreSQL 上逐项测出**没有缺陷**，以测试与反证留存证据，未做无依据改动。

## 范围（对应 D20-A-01..04）

| 子项 | 文件 |
| --- | --- |
| 01 双用户、同应用重复任务、取消与完成竞争 | `services/api/src/test/java/dev/codeless/api/concurrency/ConcurrencyConsistencyTest.java`、`ConcurrencyHarness.java` |
| 02 并发修改期间发布指定旧版本 | 同上（T4） |
| 03 任务事件、版本状态、产物哈希、部署记录一致 | `ConsistencyAudit.java`：每个测试后全库审计 17 条不变式 + 负向对照 |
| 04 修复数据库竞争与事务边界 | `versions/VersionController.java`、`deploy/PublicationService.java`；复现工具 `StatementGate.java`（只包测试上下文 DataSource） |
| 记录器/证据/说明 | `tests/integration/concurrency/**`、`docs/handoffs/D20-A.md` |

无迁移、公共契约、OpenAPI、锁文件、CI、前端或 runner 改动；无新环境变量或失败码。

## 验证（deterministic-mock；固定命令见 `tests/integration/concurrency/record-command.mjs`）

- **红色运行**（修复前代码 + 新测试）：9 项中恰好 2 项失败，即两条 D20-A-04 快照用例（“latest pointer shown as DRAFT”，“listed REQUESTED but latestSuccessful=true”）；其余 7 项与每次审计通过。
- **canonical acceptance**（干净已提交树）：`ConcurrencyConsistencyTest` 9/9，native 0，每个测试后审计 0 违规。
  T2 竞争 16 轮中取消胜 12、READY 提交胜 4，赢家决定一切；跟进任务在排队、PLAN、GENERATE、VERIFY 中取消均不改变已成功版本。
- **反证 6/6 PASSED**（各自 build exit 1 且恰好预期用例失败，文件按字节还原）：快照修复回退 ×2、去掉 worker 行锁（T1）、发布键去掉 owner（T3）、不再比对请求摘要（T4）、关闭草稿收敛（T2）。
- **回归**：受影响/相邻套件中不需真实构建运行时的 5 个（DeploymentRecords 3、ProcessRestartRecovery 1、RecoveryConvergence 6、ApiSecurityMatrix 7、TaskQueueIntegration 7）全部通过。
- **本机环境限制（如实记录）**：本机 Node 为 24.22.1，仓库仍锁定 24.16.0；凡调用 `tests/agent/prepare-runtime.mjs` 的套件在准备阶段以 “D01 Node version required” 失败（该文件未改），`verify:static` 也停在版本检查。本机聚合门禁结果与归因见交接；**合并以本 PR 远端检查为准**。

逐轮命令、提交、退出码、JUnit 统计与证据：`tests/integration/concurrency/evidence/2026-10-22/`，交接 `docs/handoffs/D20-A.md`。

## 失败路径

- 取消：排队中、PLAN/GENERATE/VERIFY 执行中、与 READY 提交同时、READY 之后；两个标签页 + 管理员同时取消全部 200，恰 1 条 TASK_FAILED；被取消任务的迟到提交被拒（`AGENT_LEASE_INVALID`），指针不动。
- 幂等：同键不同 prompt、发布同键不同应用 → 409；失败发布同键重放返回 FAILED 且不再托管；只有新键才重试。
- 版本边界：旧版本配陌生摘要或新版本摘要 → 409 `PUBLICATION_ARTIFACT_MISMATCH`；编辑与普通生成同时提交，只有一方被接受，另一方 409 `EDIT_TASK_ACTIVE`。
- 跨用户：同一任务键、同一发布键同时提交互不串用；对方列表与发布详情 404；托管页与冻结源码只带本人标记。

## 模型来源

确定性替身。阶段 runner、runner 结果与托管网关是显式 fixture（见 `tests/integration/concurrency/README.md`）；不调用模型，不证明真实构建、浏览器、公网托管或模型效果。真实模型评测另账，未执行。

## 数据与配置

无迁移、无配置或环境变量变化。回退：还原两个源文件即可，无数据影响。

## 剩余事项

- 与 D20-B（#58）的组合联调由最后启用 PR 执行。
- Node 锁定版本与本机最新 Node 的冲突需维护者按 ADR-005 单独处理（兼容性证据、CI、engines、runner 镜像摘要一起改）。
- 交接第 7 节列出未修的残余风险（应用列表 total 与分页同类问题、READY 提交在冻结后回滚的文件残留、全局 synchronized 冻结的跨用户延迟耦合）。

## 审查者

成员B；作者不自批。

## 合并条件

最新 main 组合通过全部必需检查、ci-gate=success、真实报告存在、无未解决阻塞讨论、同伴批准。
