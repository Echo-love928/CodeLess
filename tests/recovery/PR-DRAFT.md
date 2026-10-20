任务ID：D18-A（成员A｜中断恢复与资源生命周期）

问题与结果：API 进程崩溃或重启后，运行中任务的租约等于 12 分钟截止时间，界面最长 12 分钟显示“运行中”；中断或取消任务的 DRAFT 版本永远显示待定；runner 临时目录与失败任务工作区从不回收。
另外应用没有 `TaskScheduler` bean，所有 `@Scheduled` 共用一个线程，一个生成阶段会阻塞发布 worker（包括中断发布的收敛）。
修复后：短租约 + 存活进程心跳，重启后约一个租约内收敛为 `FAILED/INTERRUPTED`（永不 READY），中断发布收敛为 `FAILED/DEPLOYMENT_INTERRUPTED` 且不再调用托管；
DRAFT 随任务收敛为 FAILED；按任务 ID 幂等清理 runner 资源；保留期清理只回收无引用的临时数据，并显式保护已发布、发布中、当前预览和可用版本。

- 范围：仅 `services/api/**`、`tests/recovery/**`、`docs/recovery.md`、`docs/handoffs/D18-A.md`。子项 D18-A-01..04，见 [docs/recovery.md](../../docs/recovery.md)。
  公共契约、迁移、根锁、CI、runner、web 未修改；没有新的 HTTP 接口、失败码或数据库列。
- 验证：`node tests/recovery/record-command.mjs acceptance|mutation|regression|gate`，结果与日志摘要见 `tests/recovery/evidence/2026-10-20/commands.json`。
  - T1 真实子 JVM 在阶段与托管调用中被 `destroyForcibly` 强杀，再重启两次：任务 `FAILED/INTERRUPTED`、1 条 `TASK_FAILED`、0 条 READY；发布 `FAILED/DEPLOYMENT_INTERRUPTED`；托管只被调用 1 次；上次成功发布与 URL、最新可用版本不变；第二次重启无任何变化。
  - T2 所有者 8 次、管理员 4 次取消与过期回收、清理请求并发，0 异常、1 条 `TASK_FAILED`；排队任务 16 次并发取消、READY 任务重复取消均正常。
  - T3 过期任务的临时目录与工作副本在回收时按任务 ID 立即释放；保留期内不删除任何东西；过期后只删除无引用项；运行中任务与刚失败任务即使文件很旧也保留；重复清理为空操作。
  - T4 已发布 / 发布中 / 当前预览 / 历史可用版本的目录、产物、来源工作区逐字节不变且可重新哈希读取；植入指向已发布版本的 junction/symlink 被拒绝跟随，报告为 PARTIAL。
  - 反证：去掉草稿收敛、版本引用检查、心跳续期三项保护后，预期的 5 个测试全部失败，文件按字节恢复。
  - 回归：受影响 11 个套件 90/90（含真实 Docker 构建的 AgentLoop 11、RepairLoop 21）。
  - 本机完整 ci:gate native 1：static、runner 90/90、e2e 64/64 通过；verify:api 275 项中仅 `PreviewAcceptanceProcessTest` 5 项失败。
    在未修改的 main 436c04a 上同环境单独运行，同样 5 项失败（gate-attribution.json），属本机既有问题。以本 PR 远端检查为准，不写 success。
- 失败路径：重复/并发取消、租约过期、进程强杀、托管调用中断、存储不可用（版本报告 UNAVAILABLE、读取失败关闭）、链接/junction、清理根重叠、保留期小于 1 小时被拒绝。
- 审查修复（B 的 P2）：失败报告改为终态事务提交后冻结，失败码取已提交的值，回滚不留报告；`EXISTING` 只认失败码相同的报告。
  新增回滚窗口、首次取消与过期回收竞争（12 轮）、既有报告失败码三项测试；反证 `mutation-report` 单独运行。
- 模型来源：deterministic-mock；T1 的阶段执行器与托管适配器是记录调用的 fixture。数据库、子进程、文件卷均真实。没有真实模型调用，不声称模型或公网托管效果。
- 数据与配置：无迁移。新增配置 `codeless.tasks.lease-ms`（默认 60000）、`codeless.recovery.retention-hours`（默认 24，最少 1）、`codeless.recovery.sweep-enabled|sweep-ms|sweep-initial-ms|root`；测试 profile 关闭清理。回退方式：回滚本 PR 即可，回执与报告文件可直接删除。
- 剩余事项：Docker 构建容器不带任务标识，宿主中途断电时可能遗留容器（runner 维护者加标签后可扩展清理）；与 D18-B 的真实组合联调由最后启用 PR 承担。
- 审查者：成员B；作者不自批。
- 合并条件：最新 main 组合通过全部必需检查，ci-gate=success，真实报告存在，无未解决阻塞讨论，同伴批准。
