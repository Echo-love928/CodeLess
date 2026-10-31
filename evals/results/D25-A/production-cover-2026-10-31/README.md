# D25-A-COVER：默认关闭的生产 cover 接线与原机联调

当前整体 **HOLD，不批准合并**。实现候选 `45650b16981b04b6d65742befea8793b21f7a229`，基线 PR84 `380811d5270a72706fad0b1a74b7ffab8b97735a`，分支 `codex/d25-a-production-cover`。原九需求仍为 6/9，原六项 REAL 编辑为 6/6；本轮未启动付费复评，不能把 mock 回归或 cover 检查计入生成成功率。PR84/本候选生成质量仍为 REAL NOT_EVALUATED。

本卡生产扩展由用户明确授权。A 在本独立最后接线 PR 登记两条 owner GET 的公共 OpenAPI/schema，等待 B 增量独立复审；根锁、CI、迁移、生成/编辑协议、main 和原评测分支均未改动。VPS 没有部署本实现，开关仍默认关闭。

## 实现与证明边界

- Java 从自己的已发布记录、不可变版本、原生 VERIFIED 报告和对应 draft/runner 日志解析唯一 `/`、`/tasks` 或 `/catalog`。无证明返回不可用，不猜测根路径；客户端不能指定 URL、路径、命令或触发截图。
- 私有协调器只扫描已提交 PUBLISHED，独立单线程、OS 所有者锁、持久游标及 inflight/quarantine 标记；未知进程或清理状态停止新工作。GET 只读，原 FAILED 不重置，旧成功图片仍可读，发布和 latestReady 不受截图成败影响。
- 复用原截图队列和实际 Chromium：原生每阶段至多 12 秒、两次尝试、保留 100 条；外层 45 秒包含入队、执行及清理。保留公网 IP/DNS 固定、TLS、精确字节摘要、3 秒资产请求限制、网络隔离和 PNG 上限。封面私有根与托管根分离，捕获进程不获得平台模型密钥、数据库密码或会话。
- owner 元数据和 PNG 每次复核应用/版本/源码/制品/功能入口及图片摘要；401 匿名，404 他人（含 ADMIN）、不存在或错摘要，503 损坏或缺少原生证明。响应 no-store/nosniff，PNG 为 1280×720、至多 6 MiB。
- UI 打开封面对应功能入口，原发布根 URL 保持原值；失败继续显示占位和已发布地址。两个 GET、schema 及正反例已登记，禁止公共写入/截图端点。

## 原生测试及旧失败

完整命令、原生退出码、原始日志摘要/哈希见 [command-index.json](command-index.json) 和 `commands/`；原始完整日志保留在所列本机路径，未删除失败。

| 检查 | 命令/结果 | 证据 |
| --- | --- | --- |
| 功能入口先红后绿 | Node entry 新例 3 个先失败，随后连同原 screenshot/queue 14/14，原生 1→0 | `entry-tdd-transcript.json`（最早原生工具记录来源如实登记） |
| 队列入口绑定先红后绿 | `node --test tests/infra/cover-queue-binding.test.mjs` 原生 1；修复后与入口、原测试合计 17/17，原生 0 | `commands/*queue-red*`、`*queue-green*` |
| Java 专项最终 | `services/api/mvnw.cmd -B -ntp -f services/api/pom.xml -Dtest=CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest,CoverHttpIntegrationTest test`，18/18，原生 0 | `commands/2026-10-31T03-44-17.393Z-*.json` |
| 数字跨进程回归先红后绿 | 原生 HTTP 集成 6/7、退出 1；修复后 7/7、专项合计 18/18、退出 0 | `commands/2026-10-31T03-42-48.821Z-*` 和 `03-44-17.393Z-*` |
| 首次专项编译失败 | 新测试把 `var` 用于复合声明；已修正，旧原生退出 1 保留 | `commands/2026-10-31T03-38-06.527Z-*` |
| 合同与 UI | 合同 5/5；UI 专项 15/15；完整 static Node 54/54、前端 206/206、构建通过，原生 0 | `commands/*gate-static*` |
| runner 首轮 | 277/278，原生 1；D21 MOCK 六编辑回放固定的 Docker 镜像 ID 不存在。期间 A 误将 API 前置镜像构建与 runner 并行，标签发生变化；串行复查另录，不能覆盖此失败 | `commands/*03-36-05.858Z-gate-runner*` |
| 完整 API | `corepack pnpm verify:api`，419/419，失败/错误/跳过均0；原生0 | `commands/2026-10-31T03-48-48.941Z-gate-api.json` |
| runner 串行复查 | `corepack pnpm verify:runner`，278/278、无跳过；原生0。与API严格串行；旧277/278保留 | `commands/2026-10-31T04-22-13.579Z-gate-runner.json` |
| 完整 E2E | `corepack pnpm verify:e2e`，75/75及完整平台链PASSED/browserExitCode0；原生0。9份历史PNG逐字节恢复，新运行制品另存私有日志目录 | `commands/2026-10-31T04-29-28.541Z-gate-e2e.json` |
| 受控失败保护 | 新独立测试应用，真实 PG、Docker/Vue 构建和 Chromium；先 READY/PUBLISHED，再注入非法 Vue，原生构建退出 2、编辑 FAILED；latestReady、先前发布及 cover 保持可读 | `controlled-failure.json`、`CoverHttpIntegrationTest` |

受控失败使用明确 `deterministic-mock`，该单次 fixture 账本 5 行。它 **不是自然 FAILED、不是 REAL 模型质量样本**，不解除 B 提出的自然失败观察缺口。测试隔离数据库与原六项 REAL 运行时分开。

## 同版本真实公网与 owner 接口

保留原机原六项编辑的三个不可变已发布版本：SHOW-01/EDIT-05、SHOW-02/EDIT-04、TASK-01/EDIT-06。新 cover API 单独监听本机 61998，原 fb79 API/数据库继续保留。生成调度、恢复清理和发布 worker 关闭，没有新编辑或发布请求。

Windows 默认 DNS 的 fake-IP 仍被拒绝。仅本机联调用私有 SSH/getent 实时解析依赖，所有答案仍经过原公网地址规则、TLS 固定和实际 HTTPS 字节校验；托管目录为原真实发布回执镜像。本地开启与私有解析器的证据 **不等于 VPS 已部署，也不能替代 B 的直接公网 DNS 复核**。

- 首次候选 `76bb3f025d30288cc60af78c6caa65ad60b3c112`：SHOW-01 截图原生成功；Java 对相同图片字节数的 IntNode/LongNode 比较不一致，隔离停机，另两条未开始。采集命令原生 1、1/3，旧队列和标记保持原样。见 [首轮原始观察](controlled-public/index.json)。
- 修复候选 `45650b1`：SHOW-01、SHOW-02 成功，TASK-01 `/tasks` 原生 `FAILED/CAPTURE_FAILED`、两次、无图片。采集命令原生 1，**2/3，未改成成功**。18 项匿名/其他 USER/其他 ADMIN 的元数据及图片拒绝检查通过；原模型账本 26→26，全部应用 latestReady 与 publication 行前后一致；原 API 默认 cover 路由仍 404。见 [修复后原始观察](controlled-public-fixed/index.json)。
- TASK-01 之后仅做两次只读目标解析诊断，均成功；新增截图尝试 0。失败时的底层错误细节未采集，根因仍 UNKNOWN，不能推断为已修复的瞬态网络问题。见 [诊断](dns-probes.json)。没有重置或重试该 FAILED job。
- 两张实际通过 API 读取并核对摘要的图片已人工查看：SHOW-01 为 Grace Hopper 页面，SHOW-02 为大会日程与报名页面；不是占位页。TASK-01 未提供生产 cover 成功图片。

## 门禁与待办

四项本地门禁均以原命令完成、原生退出0，见 [gates.json](gates.json)。生产代码候选 `45650b1` 的六项精确 HEAD CI（含 ci-gate）于2026-10-31T04:17:01Z全部success，见 [原始查询](ci-code-candidate.json)。本地 `ci:gate` 聚合入口会重复执行同四项，因此未重复调用；四项原生结果与远端真实ci-gate分别登记。交付提交只追加本轮文档/证据；该提交的实时CI以 [PR86检查](https://github.com/Echo-love928/CodeLess/pull/86/checks) 和PR描述中的精确HEAD为准，不把待完成写成success。

首轮runner失败、原历史E2E74/75/gate失败及PR85的75/75复查均保留各自原证据。两次本机采集命令退出1也保持原样。门禁全部成功仍不能将本轮公网封面2/3或原九需求6/9变成达标。

全部本地门禁之后再次只读对照原DB：模型账本26→26、全部latestReady/publication行保持一致；61997原API及61998新coverAPI仍返回正常会话预检；TASK-01旧FAILED/两次尝试/无图片保持不变。保留责任仍由A原机承担，B审查证据，无跨机私密交接，见 [保留证明](runtime-retention.json)。正常登录会话可能到期，应走原登录流程，不绕过或延长会话。

B 接手：独立复算新日志/摘要与 SHA；复跑入口、队列、协议和 owner 正反例；确认默认关闭、GET 不入队、隔离后不重试、历史根封面不能变为 `/tasks`、旧发布/版本保护；独立审查两条公共契约和 UI。重点复核 TASK-01 仍失败、自然 FAILED 仍未观察以及本地/实际 VPS 的证明边界。未经双方明确的新执行范围，不付费、不部署、不批准或合并。

开发 agent input_tokens/output_tokens/合计：**UNKNOWN**，当前工具未提供实测计量；不以平台 token 替代。平台运行时另账：本轮新增外部付费模型请求 **0**，原六项 REAL 编辑 14 次/65,427 token、费用上界 ¥0.171768、实际扣费 UNKNOWN；隔离测试使用 named mock，单个受控失败 fixture 5 行账本，其余测试总用量未汇总，不能写成零。
