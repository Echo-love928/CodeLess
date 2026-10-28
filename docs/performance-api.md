# D22-A 后端容量与链路测量

本卡修改 API、其测试及性能文档；2026-10-28 按用户追加授权同步公共 OpenAPI 容量响应和契约测试。D20-A 的幂等、应用串行执行、租约围栏与不可变版本语义保持；D21-A 的真实模型评测与用量口径保持。模型质量、Mock 计时与生产容量不能互相替代。

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

上述错误复用 v0 Error JSON，附 `Retry-After: 1`；应用、用户、全局按表中顺序判定，不泄露其他用户计数。1 秒只约束容量锁等待，不是包括连接池、应用行锁和网络在内的整体 HTTP SLA。公共 OpenAPI 已实际同步至 `contracts/openapi.v0.json`，适用 POST `/api/v0/tasks`、`/api/v0/applications/{applicationId}/edits` 和 `/api/v0/applications/{applicationId}/component-edits`。编辑端点既有快照/存储类 503 保留，不能要求这些非容量错误也带 Retry-After。模型槽位满是在异步执行中记录 MODEL_CAPACITY_EXCEEDED，不虚构成任务创建 HTTP 429/503。

用户指定 A 推进本次契约同步；仓库未登记独占维护者，B 增量没有修改公共 OpenAPI，本轮由 A 单一写入六个响应，不改认证、CSRF、成功资源或其他端点。`sync-openapi.mjs` 仅替换三个 responses 对象，并输出可复用 RFC6902 补丁；`contracts/tasks/openapi.test.mjs` 已在既有 static 门禁中校验端点、错误枚举、header、正反样本及补丁与落地内容一致。落地于候选 PR 不等于已合并 main。

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

原十项 Maven 容量验收默认由 `verify:api` 发现；新增涉及付费的 `RealModelCapacityIT` 单独显式运行，不由 CI 自动花费凭据。不要同时运行 Maven 模式；`before` 临时使用记录的基线生产文件，结束后恢复原字节。不要在其运行中编辑被替换文件。命令记录器移除模型凭据、固定 deterministic-mock，给本机测试子进程补 `NO_PROXY=127.0.0.1,localhost,::1`，不改变 runner 浏览器网络策略。

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

B `34f3901` 已交付部署机 Mock 候选容量/资源/完整链路匿名报告；A 已独立核对其摘要及范围，未把 Mock 改称真实模型。A 本轮真实模型结果见下节。最后启用 PR 仍须对实际启用的不可变组合与生产调度、runner 干扰、网关、真实模型共同验收；长时间容量、多实例总量、线上切换后公网验证及用户最终批准未完成。不得关闭容器/网络/租约/预算限制来换性能。本卡不会自批或合并。

## 2026-10-28 真实 Flash 容量补验

用户确认使用既有环境变量配置、最新 Flash、费用不超过人民币2元；模型及SSH配置路径仅保留在用户提供的受保护文件/私有状态中，不进入报告。请求名和响应 `model` 均为 `deepseek-flash`；[官网映射](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)当日标为 DeepSeek-V4.1-Flash-1017，但响应未给不可变权重版本，实际权重revision保持UNKNOWN。使用既有生产 DeepSeekModelProvider/BoundedModelProvider/PlanModelService、真实HTTP和隔离PostgreSQL。测量器手动claim以控制并发，未切线上、未声称自动调度全生成或持续负载SLA。

部署机2逻辑CPU、RAM4,106,088,448字节；候选进程组实际cgroup为1 CPU、1.5GiB、swap0；独立PG为0.5 CPU、384MiB且无额外swap。单API JVM、模型并发2、queue32/user16/app8。使用锁定Node24.22.1/Maven3.9.11与既有Java21.0.13，不升级依赖或放宽隔离。

真实批次 `real-cc5e3cd7-bff5-4829-a204-b04eb920d16d`：native0/PASSED，仅执行一次。8次provider尝试中2次本地槽满拒绝（25%是受控饱和组拒绝率，不是生产流量率），6次进入真实transport尝试：5次RETURNED、1次计划内1ms MODEL_TIMEOUT。后者是否已在服务端执行及其用量未知；本地调用结束不等同上游计算取消确认。调用观察区间7.391766452s，含超时的完成包络6/区间=0.811714次/s；不是完整应用生成吞吐。6个provider包络p50=1813.332287ms、p95/max=2609.020430ms。

30/30普通HTTP查询都在真实provider包络内完成，p50=11.5172ms、p95=67.575777ms、max=78.398065ms。32个实际HTTP排队任务后第33个503 TASK_QUEUE_FULL且Retry-After=1。同应用后继不能抢占；取消后迟到回复不复活任务，尚未返回时两个槽仍占用；正常结束与计划超时后两个槽可再次同时使用。超时属于本轮已测失败，未制造或声称验证上游500/429。失败释放其他分支仍由现有确定性测试覆盖。

费用按官方高峰缓存未命中输入2元/百万、输出8元/百万预留；输入按UTF-8字节+512余量，单次输出硬限4096，最多8次尝试的整体最坏预留<0.80元。本批按实际请求尺寸预留0.14172元。五个已知响应合计input6560/output1016/total7576 tokens，按高峰价估算上界0.021248元；超时用量UNKNOWN、实际扣费UNKNOWN，不能把估算当账单。原始审计记录中的本地拒绝usage仍为null，只有源码确认未进入transport的本地拒绝不计上游尝试。

对应明确MOCK批次 `mock-151f416b-1e65-4236-b9e4-726247eec064` 为native0，8尝试/2本地拒绝/30重叠HTTP；不与真实模型或跨硬件旧样本合并。两组原始各17文件归档的SHA256、报告重算、单调时钟、取消窗口、超时后双槽重用及30个HTTP包络均独立审计通过。公开仅 `evidence/<runId>/{anonymous-report,manifest,audit}.json`；完整请求/回复、模型账本、命令日志留于部署机0700目录和本机忽略的私有归档，不上传Git。

复现：先用Java21执行 `services/api/mvnw -f services/api/pom.xml -DskipTests test-compile`；设受保护连接路径 `CODELESS_CAPACITY_SSH_CONFIG_FILE`，运行 `node tests/performance/api/stage-capacity.mjs`，生成独占候选与源码/字节摘要。再运行 `execute-remote-capacity.mjs MOCK <private-state>`，验证后才经明确授权设置 `CODELESS_CAPACITY_APPROVAL=USER_APPROVED_RMB_2` 执行 `... REAL <private-state>`；凭据仅通过SSH stdin及0600临时配置传递，结束删除。`collect-capacity.mjs <private-state> <runId>` 保留原始并导出白名单派生数据，`audit-capacity.mjs <private-run-directory> <runId>` 复算。每次新目录、无自动重试。付费批次后只补缺报告失败闸门及JUnit归档，未为追绿重跑真实请求。
