# D22-A 后端容量与链路测量

本卡只修改 API、其测试及本目录文档。D20-A 的幂等、应用串行执行、租约围栏与不可变版本语义保持；D21-A 的真实模型评测与用量口径保持。模型质量、Mock 计时与生产容量不能互相替代。

## 固定配置与拒绝语义

| 配置 | 默认 | 计数范围 |
| --- | ---: | --- |
| `CODELESS_TASK_QUEUE_LIMIT` / `codeless.capacity.queue` | 32 | 全库 `QUEUED`；已过期但尚未收敛的任务仍占位 |
| `CODELESS_USER_ACTIVE_TASK_LIMIT` / `codeless.capacity.user-active` | 16 | 所有应用属于该用户的 `QUEUED + RUNNING` |
| `CODELESS_APP_ACTIVE_TASK_LIMIT` / `codeless.capacity.app-active` | 8 | 当前应用的 `QUEUED + RUNNING`；同时运行仍固定为 1 |
| `CODELESS_MODEL_CONCURRENCY` / `codeless.capacity.model-concurrency` | 2 | 单 API 进程的在途 provider 调用；不包含排队、不按取消状态提前释放 |

配置必须为 1..10000 的整数，0/负数/过大值启动失败。默认单 API 进程部署；多副本必须按副本数计算模型总并发，不能将进程上限 2 声称为集群上限 2。入队计数由 PostgreSQL 事务锁跨进程串行保护，各副本必须配置相同阈值。本卡不引入任何分布式中间件，不增加 worker 数，也不自动调大上限。

`PlatformRepository.insertTask` 是普通生成、文字编辑、文件编辑与组件编辑共用的容量边界。计数和任务/首事件插入在同一事务，回滚不会遗留半个任务。应用所有权、幂等重放、编辑冲突仍先判定；相同请求重放不新增任务，也不重新消耗容量。旧的仅持久化任务 fixture（`FINISHED`）不进入执行队列。

| HTTP | `code` | 含义 |
| --- | --- | --- |
| 429 | `APPLICATION_TASK_LIMIT` | 当前应用活动任务已满 |
| 429 | `USER_TASK_LIMIT` | 当前用户跨应用活动任务已满 |
| 503 | `TASK_QUEUE_FULL` | 全局等待队列已满 |
| 503 | `TASK_ADMISSION_BUSY` | 短入队事务锁等待超过 1 秒 |

上述错误复用 v0 Error JSON，附 `Retry-After: 1`；应用、用户、全局按表中顺序判定，不泄露其他用户计数。1 秒只约束容量锁等待，不是包括连接池、应用行锁和网络在内的整体 HTTP SLA。公共 OpenAPI 由维护者修改，本卡在 `tests/performance/api/openapi.patch.json` 提供最小增量提案；未擅改公共契约。

`BoundedModelProvider` 包装生产配置选择出的 provider，PLAN 与 AgentModel 共用同一组槽位。满时立即抛 `MODEL_CAPACITY_EXCEEDED`，由原有失败路径记账；不会排入第二条内存队列、自动重试或宣称 READY。未到达 provider 的失败 usage 保持未知。任务取消不会让尚未返回的 HTTP provider 调用提前释放槽位；正常返回、超时或异常退出都释放。

## 耗时口径

内部日志只有任务/执行 UUID、计时与次数，没有提示词、源码或凭据。

| 日志 | 字段与口径 |
| --- | --- |
| `API_QUEUE_TIMING` | `queueMs` = 数据库 claim 时刻减 `created_at`；包含之前任务占用应用的等待与调度轮询间隔，不改变数据库时限 |
| `API_TASK_TIMING` | `executionMs` = worker 执行整个任务包络；`modelMs` = provider 的实际同步调用包络（含失败）；`buildVerifyMs` = runner 调用包络（含进程启动、构建、浏览器及通信）；`businessMs = executionMs - modelMs - buildVerifyMs`，包含 DB、文件工具、日志与最终提交 |
| `API_BUILD_TIMING` | 只在 runner receipt 验真之后记录；`buildMs = build.completedAt - build.createdAt`；`browserMs = verification.completedAt - verification.startedAt`。这是 runner 墙钟口径，独立于 Java 单调时钟包络；缺失、非法或负数保留 `null` |

`buildMs` 与 `browserMs` 是 runner 包络的内部分解，不能再和 `buildVerifyMs` 相加。未执行的模型/runner 包络可以为真实的 0，次数也为 0；纯构建/浏览器时间在无 receipt 时未知。崩溃没有完成日志，不能补一条 0 或成功。恢复/取消及实际任务状态仍以数据库与既有真值校验为准，日志不推进状态。

测量不使用既有测试故意写成 `created_at=2000-01-01` 的队列日志作性能样本；保留其原值。`samples/read-paths.json` 使用刚创建的真实任务，并显式以 CANCELLED/FAILED 收敛，未伪造 READY。

## 复现与证据

仓库根目录，使用架构锁定的 Node 24.22.1、pnpm 12.6.0、Java 21、Maven Wrapper 3.9.11、Docker：

```powershell
node tests/performance/api/record.mjs before
node tests/performance/api/record.mjs acceptance
node tests/performance/api/record.mjs regression
node tests/performance/api/record.mjs static
node tests/performance/api/record.mjs api
node tests/performance/api/record.mjs runner
node tests/performance/api/record.mjs e2e
```

Maven 类默认由 `verify:api` 发现，没有 opt-in 跳过本卡验收。不要同时运行 Maven 模式；`before` 临时使用记录的基线生产文件，结束后恢复原字节。不要在其运行中编辑被替换文件。命令记录器移除模型凭据、固定 deterministic-mock，给本机测试子进程补 `NO_PROXY=127.0.0.1,localhost,::1`，不改变 runner 浏览器网络策略。

每轮 `tests/performance/api/evidence/<UTC时间>-<模式>/` 保留命令数组、原生退出码、signal、Git HEAD、源码 SHA-256、硬件、原始 log、本轮 JUnit 与 JSON 样本。失败运行也保留。`before` 的 HEAD 是检出参考，实际生产代码是脚本中冻结的基线，源码摘要才是精确输入。

- 读路径：5 次查询预热，30 次真实 HTTP 查询；provider 由明确命名慢 Mock 闸门阻塞。每次响应完成时断言 provider 尚未结束。
- SSE：10 次真实 TCP 重连到首个业务帧；沿用 cookie、所有权和 Last-Event-ID 契约。既有 `TaskSseHttpTest` 另行覆盖非零游标续接和错误路径。
- 排队：同应用在 RUNNING 时第二个任务不能被 claim；记录深度和驻留时间，取消首任务之后才能 claim 后继。
- 边界：小配置 4/3/2 精确覆盖应用、用户、全局错误；12 次跨用户同时提交仅 4 个入队，另外 8 个明确拒绝；锁占用超过 1 秒明确 503，释放后重新接受；共用编辑插入入口不能绕过限制。
- 默认配置：真实 PostgreSQL 下 32 次入队、33rd 拒绝；满队列 100 次查询；8 个同应用与 16 个同用户边界。它是本机受控试用配置校准，不能证明公网模型、生产网关或其他硬件的吞吐 SLA。
- 模型：并发 2 个阻塞 provider 调用，20 次超限立即失败；取消但未返回仍占位；失败后槽位可复用；未知 usage 不改写为 0。

机器及最终数据、阶段门禁与限制见 `docs/handoffs/D22-A.md` 和 `tests/performance/api/summary.json`。本卡没有证据支持增加 worker、缓存、索引或中间件，因此不做这些优化。前后查询/SSE 数据只用于检查退化；不将一次样本的变快归因于容量限制。

## D22-B 接口与真实集成

API 消费既有 `build.createdAt/completedAt` 与 `verification.startedAt/completedAt`，不要求 runner 增加字段、改命令或扩权限。B 可用 taskId、executionId、sourceDigest 与原始 receipt 对齐；冷/暖构建和缓存隔离仍由 B 提供机器配置及原始样本。

目前 B 的真实资源组合、生产网关慢客户端、真实公网模型限流/时延及部署机器的长期压测均未证明。最后启用 PR 必须在真实部署上核对队列/用户/应用/模型阈值、runner 资源回落、API 不被资源耗尽拖死、缓存隔离与失败收敛。不得关闭容器/网络/租约/预算限制来换性能。本卡不会自批或合并。
