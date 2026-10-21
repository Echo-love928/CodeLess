# D18-A 中断恢复与资源生命周期

本文件说明 API 进程崩溃、重启、租约过期和取消之后，任务、版本、发布与临时资源如何收敛到唯一终态，以及哪些数据可以被回收。
PostgreSQL 始终是状态权威；文件卷与数据库不是同一事务，任何未知或冲突都以失败或“未知”呈现，**不会改写为成功或零**。

## 1. 任务终态收敛（D18-A-01）

| 场景 | 收敛结果 | 机制 |
| --- | --- | --- |
| 运行中 API 进程被杀 / 主机重启 | `FAILED/INTERRUPTED`，约一个租约内（默认 ≤60 s + 轮询） | 调度器以短租约领取：`lease_expires_at = LEAST(deadline_at, now + lease)`；只有存活进程的心跳（每 lease/3 调用 `TaskQueueService.renew`）能续期。进程死亡后无人续期，`recoverExpired` 把过期任务置为 `FAILED/INTERRUPTED`，**永不 READY**。 |
| 另一实例仍存活 | 不抢占 | 有效租约永远不会被回收；续期只延长仍有效的租约，失效后不可复活，也不超过 12 分钟截止。 |
| 用户 / 管理员取消（含重复、并发） | `FAILED/CANCELLED`，只追加一条 `TASK_FAILED` | 任务行锁串行化；终态重复取消返回原资源、不抛异常、不加事件。旧 worker 的写入和续期因租约已清除被拒绝。 |
| 取消或过期时 worker 仍在执行 | 不再启动下一阶段 | 心跳发现租约丢失后置位，调度器在阶段之间停止；正在进行的阶段不被中断（runner 在自身 finally 中删除 Docker 容器，强杀会遗留容器）。 |
| 截止时间（12 分钟）到达 | `FAILED/INTERRUPTED` | D05 既有规则不变。 |
| 任务以 FAILED 结束时存在 DRAFT 候选版本 | 版本同事务转为 `FAILED` | `DraftConvergence.failDrafts`：数据库状态为准。报告不可变，所以失败报告只在终态事务**提交后**冻结（`afterCommit`），`failureCode` 取已提交的任务失败码；事务回滚不留任何报告，之后的取消或过期回收按自己的失败码冻结（D18-B 审查）。结果：`FROZEN`；`EXISTING`（已有失败码相同的 FAILED 报告）；`CONFLICT`（已有其他报告，原样保留：失去租约的 worker 留下的 VERIFIED 报告读取时以 503 失败关闭，worker 自己的构建失败报告失败码为空、按其事实显示）；`UNAVAILABLE`（写入失败；提交后、冻结前崩溃同样没有报告，快照读取失败，界面显示无法读取错误摘要）。非 `FROZEN` 写 WARN 日志，都不会显示为可用。`latest_ready_version_id` 永不改变。 |
| 发布中（PUBLISHING/PROBING）进程崩溃 | `FAILED/DEPLOYMENT_INTERRUPTED`，**不再调用托管** | D15 账本语义：重启后账本事件数不为 1 即判中断；上次成功发布、URL 与 `latestSuccessful` 保留。 |

调度：`codeless.tasks.lease-ms`（默认 60000，范围 1000..600000）、`codeless.tasks.poll-ms`（默认 1000）。
测试中直接 `new TaskScheduler(queue, runner)` 保留旧的“租约 = 截止时间”且不做清理；生产 Spring 装配使用心跳与清理。

**调度线程**：此前应用中没有 `TaskScheduler` bean，Spring 把所有 `@Scheduled` 放在同一个线程上，一个最长 12 分钟的生成阶段会阻塞发布 worker（包括重启后中断发布的收敛）。
`TaskSchedulingConfiguration` 现提供 3 线程的 `ThreadPoolTaskScheduler`（任务队列、发布 worker、存储清理各一）；各任务仍由数据库锁协调。

## 2. 以任务 ID 请求 runner 清理（D18-A-02）

`RunnerCleanup.request(taskId)`，幂等，由调度器在每次执行结束后、以及每次回收过期任务后调用：

| 结果 | 含义 |
| --- | --- |
| `CLEANED` | 首次完整清理，写入 `<recovery-root>/cleanup/<taskId>.json` 回执。 |
| `ALREADY_CLEANED` | 回执已存在；本次仍会删除重新出现的残留，不覆盖原回执。 |
| `DEFERRED_ACTIVE` | 任务未终止，或本进程仍在执行它；什么也不删。 |
| `NOT_FOUND` | 无此任务。 |
| `PARTIAL` | 有错误（如链接/junction、I/O）；不写回执，下次请求或保留期清理再处理。 |

清理范围只限该任务：runner 临时目录 `<agent>/work/<taskId>`（`LocalBuildGateway` 现按任务 ID 分目录）、D08 可变工作副本 `<workspaces>/<taskId>/source` 与 `.write-*.tmp`。
D08 不可变快照 `snapshots/` 保留，因为 READY 任务的常驻预览会读取它。任务行 `FOR UPDATE` 让多个 API 实例的并发请求串行化；清理从不修改任务状态。

**未覆盖**：Docker 构建容器名为 `codeless-build-<随机 UUID>`，不带任务标识（runner 模块不在本卡范围）。正常与取消路径由 runner 自身删除容器；
宿主机在构建中途断电/被杀时容器可能遗留。建议 runner 维护者为容器加 `--label dev.codeless.task=<taskId>` 并提供按标签回收入口，本卡的清理请求即可扩展到容器。

## 3. 存储保留期清理（D18-A-03 / D18-A-04）

`StorageSweeper.sweep()`；默认每小时一次（`codeless.recovery.sweep-ms`，首次延迟 `sweep-initial-ms` = 5 分钟），`codeless.recovery.sweep-enabled=false` 可关闭（测试 profile 已关闭）。
保留期 `codeless.recovery.retention-hours` 默认 24，**最少 1 小时**（远大于 12 分钟任务截止和 240 秒构建上限，所以正在写入的数据不会过期）。

只有同时满足以下条件才删除：名称可识别；数据库中**无引用**（删除前再查询一次）；整棵子树最近修改时间早于截止点；路径上没有链接/junction。

| 根目录 | 可回收的临时数据 | 保留 |
| --- | --- | --- |
| 版本卷 `<versions>/<uuid>/` | 无 `application_versions` 行、无发布、非当前版本指针的目录（SQL 回滚的孤儿）；有行的版本目录里早于保留期的 `.source-*` / `.outcome-*` 中断尝试 | 任何有数据库行的版本目录及其 `source/`、`outcome/`、清单（含 FAILED 版本的诊断） |
| runner 产物 `<agent>/artifacts/` | 无 `builds` 行且未被版本引用的 `<buildId>/`（验证失败或提交前崩溃）；`.build-*` 跨卷复制残留 | 有构建记录的产物（常驻预览读取） |
| runner 临时 `<agent>/work/` | 已终止或无任务行的 `<taskId>/`；旧布局 `source-*`、`build/codeless-build-*` | 运行中任务的目录 |
| D08 工作区 `<workspaces>/<taskId>/` | FAILED 且 `updated_at` 早于保留期、未生成任何受保护版本的任务；无任务行的目录 | 运行中任务；READY 任务；受保护版本的来源任务 |

**显式保护（D18-A-04）**：受保护版本 = 所有 `VERIFIED` 版本 ∪ 被任何发布（含 REQUESTED/FAILED）引用的版本 ∪ 各应用 `latest_ready_version_id`（当前预览）。
它们的版本目录、构建产物和来源任务工作区不会被删除。托管目录不在清理根中。

**从不列出**：Agent 日志 `journal/`、`receipts/`、浏览器证据 `evidence/`、恢复回执、部署账本、托管根、管理与模型审计。这些是记录而非临时数据，其备份与留存属于部署职责。

安全：清理根互相重叠时整轮拒绝；未知名称保留；链接、junction 或超过 50,000 个条目时拒绝该候选并报告；每个根最多处理 10,000 个子项。
报告 `status` 只有 `COMPLETE` 与 `PARTIAL`，任何错误都不会报告为成功。日志行：`storage sweep <status> removed={...} kept={...} errors=[...]`。

## 4. 运维处理

- `PARTIAL` + `CLEANUP_LINK_REJECTED:<root>/<name>`：私有卷中出现链接或 junction，属于异常。先人工检查目标，不要直接删除链接所指内容。
- `CLEANUP_ROOTS_OVERLAP`：配置把两个清理根指向了同一目录或互相嵌套，需修正配置。
- 版本快照读取 503，且任务 `FAILED`：先看数据库版本行与 `<versions>/<id>/outcome`，按 D11 契约人工核对，不自动重放。
- 发布 `DEPLOYMENT_INTERRUPTED`：托管侧可能有已上传但未登记的孤儿位置（D15 已知限制），需人工核对，禁止自动重放。

## 5. 验证（可复现）

```bash
node tests/recovery/record-command.mjs acceptance   # T1–T4 + 心跳/过期专项，真实 PostgreSQL 17.6
node tests/recovery/record-command.mjs mutation     # 反证：破坏 3 项保护后，预期测试必须失败，文件按字节恢复
node tests/recovery/record-command.mjs regression   # 受影响的任务/管理/Agent/修复套件
node tests/recovery/export-evidence.mjs 2026-10-20
```

证据位于 `tests/recovery/evidence/2026-10-20/`。T1 启动真实子 JVM（生产调度器、发布 worker、心跳），用 `destroyForcibly` 在阶段与托管调用进行中强杀，再重启两次。
阶段执行器与托管适配器是**明确记录调用的 fixture**：证明的是重启语义，不证明模型、构建或公网托管质量。
