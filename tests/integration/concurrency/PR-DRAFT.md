任务ID：D20-A（成员A）／分支 `codex/d20-a-concurrency`／base `main = 9f99612`（已合入 #61；分支从 `c5bec00` 开始）

## 问题与结果

### 一、读取快照（第一轮）

- **触发场景**：版本列表、发布列表、发布详情这三个接口，与 READY 提交或发布 worker 的提交并发执行。
- **修复前**：这三个接口用多条各自提交的语句拼出一个响应。用测试专用的 JDBC 语句闸门，把提交精确放在两条语句之间，可以确定性复现：
  - 版本列表返回 `latestReadyVersionId=v3`，同一响应的条目里 v3 却是 `DRAFT`；新草稿落在两条语句之间时，`total=4` 而条目只有 3 条。
  - 发布列表把某个发布列为 `REQUESTED`，同时又把它作为 `latestSuccessful`；发布详情中 `publication.status=REQUESTED`，而 `latestSuccessful` 指向它自己。
- **修复后**：三个读取在一个只读 REPEATABLE READ 事务内完成，与 AdminQueries、TaskEventReplay、诊断接口的既有做法一致。同一闸门下响应自洽；响应结构、状态码与权限都不变。

### 二、冻结与租约边界（第二轮，D20-B 审查 `3e5d336` 时在其主机上暴露）

- **触发场景**：卷较慢时，READY 提交或草稿冻结的耗时，超过任务租约的剩余时间。
  - 心跳用 UPDATE 同一任务行来续租，而工作线程自己的事务正持有这一行，所以心跳被挡住。
  - 冻结是进程级 `synchronized`，三个调度器会互相排队，进一步拉长等待。
- **修复前**：
  - `AgentRunStore.complete` 先把 VERIFIED 结果原子落盘，再做带租约检查的 READY 迁移。租约过期时迁移失败、SQL 回滚，盘上却留下 VERIFIED 结果；之后恢复把版本记为 FAILED。这就是 B 本机 T3 的 “SQL FAILED、盘上 VERIFIED”，以及随后 5 个用例的级联失败。
  - `draft` 持锁冻结源码，结尾再查一次租约，导致一个存活的 worker 被判为 INTERRUPTED。
  - 本机的确定性复现是：在生产存储里暂停冻结，直到租约过期。READY 提交用例得到 `FAILED/INVALID_STAGE_RESULT`，且 VERIFIED 结果仍可读；草稿用例得到 `FAILED/INTERRUPTED`，0 个版本。
  - 每次冻结加 1500 ms 的慢卷模拟下，修复前代码让 T3 的 8 个任务全部失败，审计报出和 B 相同的 V2 信息。
- **修复后**：
  - READY 提交把 VERIFIED 冻结放到最后，排在所有可能拒绝提交的检查之后，包括带租约检查的 READY 迁移。
  - 草稿在拿任务行锁之前冻结源码，心跳照常续租；如果中途失去租约，只会留下无引用目录，由 sweeper 清理。
  - 调度器会记录被吞掉的失败原因。
  - 慢卷模拟下验收 11/11 通过。
- **其余写路径**：同应用重复提交、取消与 READY 提交竞争、双用户同键、单次逻辑发布、并发修改期间发布旧版本，在真实 PostgreSQL 上逐项测出没有缺陷，以测试和反证留存。

### 三、同步 main 与说明更正（第三轮，2026-10-23）

- B 批准了 `80d355c`（review 5626075409），并在其主机上复跑 acceptance，11/11 通过。批准只覆盖该提交。
- B 的两条非阻塞说明建议已更正：
  - 交接 9.1 不再把 B 的线程快照归到冻结中。那次快照只佐证路径安全检查的成本，冻结的归因不变。
  - 反证计数改为 9 个模式、10 次运行，见“验证”。
- `80d355c` 的远端 CI 失败来自 runner 镜像迁移，与本 PR 的代码无关。#61 把各作业固定到 `ubuntu-24.04`，已合入 main。
- 本 PR 用 merge 同步 `main = 9f99612`，合并提交为 `e4d91d9`，只带入 #61 的 `ci.yml`；随后在合并提交上重跑 canonical acceptance。生产代码没有变化。

## 范围（对应 D20-A-01..04）

| 子项 | 文件 |
| --- | --- |
| 01 双用户、同应用重复任务、取消与完成竞争 | `services/api/src/test/java/dev/codeless/api/concurrency/ConcurrencyConsistencyTest.java`、`ConcurrencyHarness.java` |
| 02 并发修改期间发布指定旧版本 | 同上（T4） |
| 03 任务事件、版本状态、产物哈希、部署记录一致 | `ConsistencyAudit.java`：每个测试后对全库审计 17 条不变式，并有负向对照；P4/X1 读取各发布位置实际提供的字节 |
| 04 修复数据库竞争与事务边界 | `versions/VersionController.java`、`deploy/PublicationService.java`（读快照）；`agent/AgentRunStore.java`（冻结与租约边界）、`tasks/TaskScheduler.java`（失败原因日志）。复现工具：`StatementGate.java`（只包测试上下文的 DataSource）、`ConcurrencyHarness.StoreGate`（只包测试上下文的快照存储） |
| 记录器/证据/说明 | `tests/integration/concurrency/**`、`docs/handoffs/D20-A.md` |

没有迁移、公共契约、OpenAPI、锁文件、CI、前端或 runner 改动；没有新的生产环境变量或失败码。测试专用的 `CODELESS_D20A_SLOW_FREEZE_MS` 只由记录器的 `@slow` 设置。

## 验证（deterministic-mock；固定命令见 `tests/integration/concurrency/record-command.mjs`）

- **canonical acceptance**：@`e4d91d9`（第三轮，同步 main 后的合并提交），干净的已提交树，Node v24.22.1、Java 21.0.12.1、Docker 29.9.2。
  - `ConcurrencyConsistencyTest` 11/11 通过，native 0，signal 为 null，测试类 219.7 秒；每个测试后审计 0 违规，没有遗留的排队任务。
  - T2：16 轮中取消胜 11、提交胜 5。
  - 两个新用例：冻结期间租约确实过期，READY 提交仍然只提交一次；草稿冻结期间心跳持续续租。
  - 负向对照报出 10 条违规（E1、E3、V3、V5、P2、P3、P4）；排除对照应用后与注入前的基线一致。
  - 第二轮 @`d55a8de` 同样 11/11（T2 取消胜 12、提交胜 4）。B 在其主机上复跑 `80d355c`，也是 11/11，测试类 574.855 秒。
- **慢卷模拟**：
  - `acceptance@slow` 11/11 通过，每次冻结加 1500 ms 并串行。
  - `mutation-lease-boundary@slow`（`AgentRunStore` 用 B 审查时的版本）复现了 B 的模式：T3 的 8 个任务全部失败（INTERRUPTED 或 RUNNER_ERROR），出现 V2 “FAILED version has a usable VERIFIED outcome / without a frozen FAILED report”，d20a01 也失败。
- **反证 @`94a5e70`，9 个模式各 1 次，全部 PASSED**：每次都是 Maven exit 1、signal 为 null、预期用例全部失败，文件按字节还原。连同上面的 `mutation-lease-boundary@slow`，共 10 次反证运行。
  - 快照修复回退 ×2。
  - 去掉 worker 行锁（T1）。
  - 发布键去掉 owner（T3）。
  - 不再比对请求摘要（T4）。
  - 关闭草稿收敛（T2）。
  - `lease-boundary`：两个新用例都失败。
  - `freeze-first`：READY 提交用例失败；另外 T1 的 `ready()` 在本机正常速度下也触发了同一回滚，留下 V2 残留。
  - `draft-in-lock`：草稿用例失败。
  - 计数口径：各模式的预期失败用例累计 11 个（lease-boundary 与 freeze-first、draft-in-lock 有重叠，去重后 9 个）。上一版正文的“11/11”与记录不符，已按 `commands.json` 更正。
- **红色运行**：修复前的 `AgentRunStore` 加新用例，两项按上述方式失败（`.local-data/d20-a/red-2/`，私有）。
- **回归**：7 个不需要真实构建运行时的套件 35/35 通过，包括 StorageSweeper 与 LocalVolumeSnapshotStore。
  - 依赖真实运行时的套件被本机 Node 锁挡住。
  - 在合入 #60（Node 24.22.1 锁）的本地组合副本里另跑了 9 个这类套件：80/80（AgentLoop、Csrf、RepairLoop、Publication、EditLifecycle、EditVerification、LocalEditScope、SourceExport、VersionHttp，Node 24.22.1）。
- **本机门禁**：@`d55a8de`：static 停在 Node 版本检查（锁定 24.16.0，由 #60 处理）；api 225 项中 5 failure（本机既有 PreviewAcceptanceProcessTest）和 10 error（被 Node 锁挡住的套件），本卡 11/11；runner 101/101；e2e 75/75；本机 ci-gate 未全绿。合并以本 PR 的远端检查为准。第三轮没有重跑本机门禁、`@slow` 和反证：同步只带入 `ci.yml`，生产代码没有变化。
- **远端检查**：`80d355c` 的 run 39923146981 中，verify:api、verify:runner、ci-gate 失败，原因是 `ubuntu-latest` 切到 Ubuntu 26.04 后，Playwright 1.60.0 无法准备 Chromium；本卡用例在远端 11/11。这次失败保留，没有重跑。#61 合入后，以本 PR 最新 HEAD 的检查为准。

逐轮命令、提交、退出码、JUnit 统计与证据见 `tests/integration/concurrency/evidence/2026-10-22/`（第一、二轮）和 `evidence/2026-10-23/`（第三轮 canonical 证据与 `third-round.json`），交接见 `docs/handoffs/D20-A.md`（第 9 节为第二轮，第 10 节为第三轮）。

## 失败路径

- **取消**：覆盖排队中、PLAN/GENERATE/VERIFY 执行中、与 READY 提交同时、READY 之后。
  - 两个标签页加管理员同时取消，全部返回 200，恰好 1 条 TASK_FAILED。
  - 被取消任务的迟到提交被拒（`AGENT_LEASE_INVALID`），指针不动。
- **幂等**：
  - 同键不同 prompt、或发布同键用于不同应用，返回 409。
  - 失败的发布用同键重放，返回 FAILED 且不再托管；只有新键才会重试。
- **版本边界**：
  - 旧版本配陌生摘要或新版本的摘要，返回 409 `PUBLICATION_ARTIFACT_MISMATCH`。
  - 编辑与普通生成同时提交，只有一方被接受，另一方返回 409 `EDIT_TASK_ACTIVE`。
- **跨用户**：同一任务键、同一发布键同时提交，互不串用；对方的列表与发布详情返回 404；各位置实际提供的页面和冻结源码只带本人标记。
- **慢卷与租约**：
  - READY 提交冻结超过租约、第二个实例尝试恢复：任务仍然 READY，结果可读，VERIFY 只执行一次。
  - 草稿冻结超过租约：心跳持续续租，任务 READY，只产生 1 个版本。
  - 冻结本身失败时，SQL 回滚，盘上没有新结果；任务记为 FAILED 并冻结 FAILED 报告。

## 模型来源

确定性替身。阶段 runner、runner 结果与托管网关是显式 fixture（见 `tests/integration/concurrency/README.md`）；不调用模型，不证明真实构建、浏览器、公网托管或模型效果。真实模型评测另账，未执行。

## 数据与配置

没有迁移，也没有生产配置或环境变量变化。回退方式：还原 `VersionController.java`、`PublicationService.java`、`AgentRunStore.java`、`TaskScheduler.java` 即可，不影响数据。如果草稿冻结后失去租约，留下的无引用版本目录由既有 sweeper 按 ORPHAN_VERSION 清理。

## 剩余事项

- 与 D20-B（#58）的组合联调由最后启用的 PR 执行。
- Node 锁定版本与本机 Node 的冲突由 #60 单独处理。#60 已同步同一 main（`033fd13`），待维护者按 ADR-005 确认。
- 交接第 7 节列出了未修的残余风险：
  - 应用列表的 total 与分页属于同类问题。
  - 冻结仍是进程级 `synchronized`，带来跨用户的延迟耦合，但不再导致租约丢失。
  - 心跳续租在持锁事务回滚后可能"复活"已过期的租约，修复后只在冻结本身失败时出现，结果仍一致。
  - 第二个 API 实例只在数据库连接中途断开时，才可能与第一个实例写到同一个账本序号。

## 审查者

成员B；作者不自批。B 已批准 `80d355c`（[review 5626075409](https://github.com/Echo-love928/CodeLess/pull/59#pullrequestreview-5626075409)）。之后的新提交（文档更正、同步 main、第三轮证据）需要 B 增量复审。

## 合并条件

最新 main 组合通过全部必需检查、ci-gate=success、真实报告存在、无未解决的阻塞讨论、同伴批准。
