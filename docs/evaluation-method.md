# 生成评测方法（D21-A）

本文定义 CodeLess 真实模型**生成/修复**评测的输入冻结、执行、指标口径、故障注入和复算方式。它与 CI 的确定性门禁分开：
CI 使用明确命名的 `deterministic-mock`，只证明平台链路；真实模型效果只来自本文的 REAL 批次，且不能用 mock 结果代替。
编辑评测（6 个组件修改请求）与需求行为断言由 D21-B 维护（`evals/browser/**`、`evals/edit/**`、`docs/evaluation-ui.md`）。

## 1. 冻结输入与分母

| 文件 | 内容 |
| --- | --- |
| `evals/generation/requirements.json` | 9 个需求：展示页（SHOW-01..03）、LocalStorage 任务工具（TASK-01..03）、搜索分类详情目录（CAT-01..03），每条含原始提示词、数据模式、应用名和需求自述行为 |
| `evals/generation/faults.json` | 3 个代码故障（FAULT-CODE-01..03）和 2 个环境故障（FAULT-ENV-01..02），每条含注入方式、标注和预期 |
| `evals/generation/run-config.json` | provider、运行时预算（3 轮修复 / 12 次模型请求 / 20 工具槽 / 50,000 计费 token / 12 分钟）、尝试策略、执行隔离和计量口径 |

- `prompt` 原样作为任务请求发送，harness 不追加、不改写；`verify-batch.mjs` 逐字节核对任务行里的 prompt。
- **分母永远是冻结计划**：需求 9 个（每类 3 个），故障 3+2 个，各自统计、互不混入。缺失记录、harness 错误或未终止的样本仍在分母内，计为失败，不会被丢弃。
- 每个样本在一个批次中**只发起一次**（`attempt=1`），任务内部最多 3 轮修复由平台强制。重新发起需求必须是**新批次**；旧批次的失败样本不删除、不覆盖、不选择性重跑（D21-A-04）。
- `evals/generation/.gitattributes` 设 `-text`：冻结文件与原始记录按字节保存，任何平台检出后摘要不变。
- harness 在启动前比对 `run-config.json` 的 `runtimeBudget` 与平台 `RuntimeBudget` 常量，不一致即 harness 错误（防止口径漂移）。

## 2. 执行

```bash
# 真实批次（付费）：需要显式批准、提供商凭据，且 harness/冻结集已提交
CODELESS_EVAL_REAL_APPROVED=1 node scripts/eval/run-batch.mjs --mode real
# 确定性 dry run（不付费，只验证 harness；结果在 .local-data，永不进入统计）
node scripts/eval/run-batch.mjs --mode mock [--only SHOW-01,FAULT-ENV-01]
# 驱动中断后续跑：只启动从未开始的样本
CODELESS_EVAL_REAL_APPROVED=1 node scripts/eval/run-batch.mjs --mode real --resume evals/generation/runs/<batchId>
```

1. **门槛**：REAL 必须 `CODELESS_EVAL_REAL_APPROVED=1`、`CODELESS_MODEL_API_KEY`/`CODELESS_MODEL_NAME` 存在，且 harness、冻结集、提示词、模板、runner 等范围内文件已提交（`git status` 干净）。否则什么都不创建。
2. **隔离检出**：REAL 在 `.local-data/d21-a/worktrees/<batchId>` 建立 HEAD 的分离 worktree 并离线安装依赖，所有样本都在这份已提交代码上运行；开发者同时修改主检出不影响批次。
3. **预检**：Node、Java 21、Docker、`tests/agent/prepare-runtime.mjs`（依赖、Chromium、构建镜像）、Maven test-compile。任一失败则不启动任何样本，预检结果写入 `preflight-N.json`。
4. **每个样本一个 JVM**：`mvnw -Dtest=GenerationEvalIT test`。`GenerationEvalIT` 在全新 PostgreSQL 17.6 容器和私有运行根目录中，用生产 `AgentLoop`/`AgentModel`/文件工具/`LocalBuildGateway`（受限 Docker 构建 + Chromium 验证）和真实 `DeepSeekModelProvider`，通过 `TaskScheduler.tick()` 把任务推进到 READY 或 FAILED。它**不断言 READY**：失败的生成是有效结果；非零退出只表示 harness 本身出错。
5. **追加写**：`batch.json`（冻结副本摘要、HEAD、计划样本）先于任何样本写入；每个样本 `spec.json`、`invocation.json`（开始）、`record.json`（harness 写）、`invocation-result.json`（结束）都以独占创建写入，不能覆盖；`batch-events.jsonl` 只追加。进程超时 25 分钟，超时杀进程树并记录，不重试。
6. **凭据**：凭据只进入 REAL 样本 JVM 的环境；结束时按字节扫描批次目录和私有日志，出现次数写入 `batch-complete.json`（必须为 0），值本身从不写出。

## 3. 原始记录（`samples/<id>/record.json`）

SQL 真值：`applications`、`generation_tasks`（含 prompt、状态、`repair_attempts`、`failure_code`、时间）、`task_events`、`application_versions`、`builds`、`model_calls`；
模型审计（每次调用的 provider usage 原文、requestId）；完整私有任务日志（`plan`、`model.request/usage`、`tool.*`、`draft`、`runner.result`、`repair.failure`、`failure` 等）；
平台预算计量 `platformMeter`；每个不可变候选的源码（`source/v<N>/`，逐文件 sha256，取自快照库并复核）；每次浏览器验证的截图（摘要复核）；
故障注入证据（注入前后全文与摘要、原始 provider `done`）；环境探测结果；harness 计时与错误。本地路径前缀替换为 `<repo>`/`<run-root>`/`<user-home>`。

## 4. 指标口径（`scripts/eval/ledger.mjs`，纯函数）

| 指标 | 定义 |
| --- | --- |
| 首轮成功 | 第一次真实构建+浏览器验证即 `VERIFIED`，任务 READY，修复 0 轮 |
| 最终成功（平台） | 任务 READY（平台已保证 ≤3 轮修复），且 harness 无错误。harness 错误即使任务行为 READY 也不计成功 |
| 需求级最终成功 | 平台 READY 且 D21-B 行为断言通过。D21-B 结果接入前为 `PENDING_D21_B`/`null`，不计为成功 |
| 失败类型 | `MODEL_TRANSPORT`（网络/超时/限流/鉴权）、`MODEL_OUTPUT`（无效响应、协议、计划、越界文件、验收动作、模型提出的非法文件操作）、`CODE_NOT_REPAIRED`（`AGENT_REPAIR_LIMIT_EXCEEDED`/`NO_PROGRESS`）、`BUDGET`（模型/工具/token/截止时间）、`ENVIRONMENT`（runner、证据、审计、检查点等平台/主机故障；VERIFY 失败沿用平台 `RepairController` 的 INFRASTRUCTURE 分类，评测不改判）、`CANCELLED`、`HARNESS`（缺失记录、harness 或注入出错）、`UNCLASSIFIED` |
| 修复轮数 | `generation_tasks.repair_attempts` |
| 实际 token | 与 D17-A 管理指标相同：只用 provider 回报的 `input_tokens`/`output_tokens`。调用 `KNOWN`=两者都有（真实 0 就是 0）；`UNKNOWN`=已结束但任一缺失；`PENDING`=未结束。`known*` 只对 KNOWN 求和，是下限；**精确总量仅在所有调用 KNOWN 时给出，否则为 `null`**。任何样本没有任务记录时，汇总也视为不完整 |
| 缓存命中 | DeepSeek `prompt_cache_hit_tokens` 是输入 token 的子集，只单列展示，绝不再加一次 |
| 预算计费 | 日志 `model.usage.chargedTokens`（未知用量按 UTF-8 字节+512+4096 保守估算），单列为“运行时预算计费”，从不作为实际用量 |
| 耗时 | 任务 `created_at` 到终态事件 `occurred_at`；中位数与最大值只在已知样本上计算，并列出未知数 |

`report.json` 另含一致性核对：评测自己算的模型请求数、工具槽、计费 token 与平台 `RuntimeBudget.meter` 及 `model_calls` 行数逐样本比对。

## 5. 故障集

故障由评测主机注入并全部标注（`origin` 以 `HOST_` 开头），不当作模型自发错误，也不计入 9 个需求。

| ID | 注入 | 机制 | 预期（逐项检查） |
| --- | --- | --- | --- |
| FAULT-CODE-01 | 缺失模块导入 | 真实 GENERATE 返回 `done` 后、冻结快照前，用生产 `files.read`/`files.update`（预约 2 个工具槽并写入任务日志）在主页面 `<script setup>` 首行加入不存在组件的导入 | 首次验证 FAILED 且分类 CODE、决定 REPAIR；3 轮内 READY；验收动作不变；最终源码摘要不同于注入版本 |
| FAULT-CODE-02 | 严格类型错误 | 同上，在 `<script setup>` 末行加入 `number` 赋字符串 | 同上 |
| FAULT-CODE-03 | 异步页面异常 | 同上，末行加入 `setTimeout` 中抛错（构建通过，浏览器记录 PAGE_EXCEPTION） | 同上 |

FAULT-CODE-03 在冻结前由“同步 setup 抛错”改为异步页面异常：确定性 dry run 显示同步版本使预期元素不渲染，浏览器失败码为 `ACTION_TIMEOUT`，
`RepairController` 将其归为 INFRASTRUCTURE，平台不会尝试修复，因此无法检验修复能力。该分类缺口作为发现 D21-A-F1 单独记录
（`evals/generation/evidence/2026-10-23/dry-run-classifier-gap.json`），交 D24/D26 缓冲处理，本卡不修改平台代码。
| FAULT-ENV-01 | 容器 CLI 不可用 | 驱动启动该样本 JVM 时移除所有含 docker 可执行文件的 PATH 目录；harness 先确认确实不可见。PLAN/GENERATE 正常（真实付费） | FAILED 于 VERIFY、分类 INFRASTRUCTURE、无 REPAIR 决定、0 轮修复、0 次 REPAIR 请求、仅 1 个不可变候选、失败后无文件工具调用 |
| FAULT-ENV-02 | 模型端点不可达 | harness 把 JVM HTTPS 代理指向已关闭的回环端口，并在任务前证明 TCP 被拒、无凭据探测失败；请求从未到达 provider（不付费） | FAILED、`MODEL_NETWORK`、分类 MODEL_INTERFACE、只有 1 次模型请求（无重试）、该调用 usage 为 UNKNOWN、0 次文件工具、0 轮修复 |

## 6. 复算与校验（T1/T4）

```bash
node scripts/eval/report.mjs evals/generation/runs/<batchId> --check   # 从原始记录重算 report.json/report.md 并逐字节比较
node scripts/eval/verify-batch.mjs evals/generation/runs/<batchId>     # 分母、任务 ID、原始输入、追加写、mock/真实分离、凭据扫描、报告复算
node --test tests/eval/generation/*.test.mjs                           # 确定性单元/集成测试（合成数据，只在临时目录）
```

报告 `inputs` 列出它读取的每个原始文件的 sha256；改动任意一个原始记录都会使 `--check` 失败。报告不含生成时间等非确定字段。

## 7. mock 与真实分账

- MOCK 批次只写在 `.local-data/d21-a/mock-runs/`，驱动拒绝写入 `evals/generation/runs/`；其 provider 标为 `deterministic-mock`，统计标注 `DETERMINISTIC_MOCK_HARNESS_DRY_RUN_NOT_MODEL_QUALITY`。
  mock 不回报 usage，按平台保守计费会在 VERIFY 前耗尽 50,000 预算，因此 dry run 使用固定且显式标注 `SYNTHETIC_MOCK_COUNTERS` 的计数，这些数字不是用量。
- REAL 批次中出现任何非批次 provider/model 的调用，`realModelEvidence=false`，`verify-batch` 失败。
- 平台运行时 token（本文的账本）是公共研发开销，与开发 agent 的 input/output token 分开记录，二者不相加。

## 8. 局限

9 个样本只反映这批场景，不代表泛化成功率；模型输出非确定，同一冻结集在不同时间可能得到不同结果，因此比较必须在新批次中重跑全部样本（D25-A）。
环境故障是受控主机条件，不覆盖所有真实运维故障；代码故障是注入的，不代表模型自发错误的分布。平台 READY 只代表模型自己提出的验收动作在真实浏览器中通过，需求级判断依赖 D21-B。

## 9. 给 D21-B / D25-A 的接口

- 每个批次：`batch.json`（批次 ID、模式、HEAD、冻结摘要、计划样本），`report.json`（`requirements.samples[*]` 含 `taskId`、`finalVersion{id,number,status,sourceDigest,sourceDirectory}`、
  `plan.pages[*].route/file`、`lastVerification{status,buildExitCode,verificationStatus,screenshot}`）。
- 每个样本：`samples/<id>/source/v<N>/` 为可重建的不可变源码，`screenshots/` 为平台浏览器验证截图，`record.json` 为完整原始记录。
- 行为断言结果应由 D21-B 在自己的目录中引用 `batchId` + `sampleId` + `finalVersion.sourceDigest`，不修改本批次文件；需求级最终成功 = 平台 READY ∧ 行为断言通过。
