# D25-A 固定样本复评与指标定稿

## 2026-10-30 修复后复评（当前结论）

**尚未解除阻塞：最新实测165e31c独立需求6/9、代码2/3、环境2/2，HOLD；不批准、不合并。** 后续精简提示修复门禁预算回归，当前源码验证点de7c40ff1f5d5b32328a195067bfdf88cbbfa9e2、生产修复4c9455d85175a2df83aecdd399e370da3e302a73，真实模型验收NOT_EVALUATED，不能继承165e31c的成绩。原14项完整执行两轮，旧失败保留；按任务卡第8条先同伴协调再继续付费复评。

详细子项、每项验收命令/退出/证据、阶段门禁、PR摘要、互审、待接手及开发/运行时分账全部见 [2026-10-30交付报告](../evals/results/D25-A/followup-2026-10-30/README.md)。独立草稿修复PR#83，评测PR#82。B的6ecf3f5模式校验代码阻塞已复审关闭；真实编辑/公网证据仍HOLD。

原 ci:gate 提交de7c40ff1f5d5b32328a195067bfdf88cbbfa9e2，原生退出 **0**，状态 **PASSED**；证据 evals/results/D25-A/commands/2026-10-30T03-18-37.784Z-gate/command.json，源码字节/HEAD 执行期间未变化=true/true。

原运行时已在精确a863b76独立检出上恢复并合法重新登录，六项只读预检6/6 PREFLIGHT_READY，原13个模型调用身份/账本未变，新模型请求0，真实编辑执行0；见 evals/results/D25-A/followup-2026-10-30/runtime-handoff.json。这是A原设备的历史候选，不能证明新4c9455d/de7c40f同候选编辑或公网验收。会话仅在 .local-data/d25-a/runtime-2026-10-30/session.private.json，值不公开；跨设备回环地址不可直接使用，接手前须再次检查在线性和正常会话时效。A保留导出/私有根至B终态采集及归档确认。

扩展公开阻塞：自动审批拒绝新增两轮评测载荷的推送，原公开授权只覆盖约5.2MB，本次累计约11.6MB，正在等待具体补充授权。新增原始记录/模型输出/源码/截图等仅本地保留，未绕过上传；远端PR82仍是旧9ad40a0。独立生产修复PR83只含4个源码/测试文件，已更新4c9455d。

## 2026-10-29 原始交付（历史保留）

2026-10-29（Asia/Tokyo）。**真实需求行为 7/9，未达 ≥8/9；代码故障 1/3，未满足全部约定；环境故障 2/2。候选 HOLD，不具备验收或合并条件。** 平台 READY 为 8/9，不能用它覆盖独立行为失败。

## 固定提交与证据

- 分支：`codex/d25-a-final-evaluation`。起始 `bf7352653912641dc4a6981795fe45b5eecc0124`（D24-A）；跟踪文件干净，保留原 10 个未跟踪目录。
- 首轮：`2026-10-23T14-16-43Z-real-545bbebf`，执行提交 `c25b722bee9122c7bc7cafe01b5739b7a7f4e1ac`；原目录 `evals/generation/runs/`，未改写其文件。
- 本轮：[`2026-10-29T10-12-17Z-real-4e8e6f51`](../evals/results/generation/runs/2026-10-29T10-12-17Z-real-4e8e6f51/report.md)，执行提交 **`a863b76e9d5785e20cb6f0d43bb67f79f5df0a50`**。开始 19:12:17，结束 19:21:25；一次完整 14 样本，无外层重试、替换、删减。
- 上游将 D24 squash 到 `5de2e6cf995c95ee91a1f9dc40403654df0af3de` 后，只把本卡提交重放到当前 main，得到 `625c58f`；最终指标关联及测试提交为 **`311a96f6e30972e88ff9d0ed49702c534a25ea52`**，完整本地 gate 在它上面运行。后续证据/交接提交不冒称新的真实模型执行。
- [`candidate-provenance.json`](../evals/results/D25-A/candidate-provenance.json) 与 [`final-candidate-provenance.json`](../evals/results/D25-A/final-candidate-provenance.json)：API/runner/prompts/templates/受控镜像输入/根依赖配置的 Git 内容无差异，实际执行时记录的运行时源码字节也全部相同；原批次记录的五个 driver/harness Git blob 摘要相同。main 另含已合并的 PreviewPanel 修复，组合后的前端走本轮门禁。原执行 SHA 不改写成变基后 SHA。最终 provenance 区分 inspectedCommit 和 fullGateCommit，避免把增量静态验证点误叫全量门禁点。
- 原始任务/日志投影、源码、截图、调用账本、进程结果和冻结副本在新批次内；[`comparison.json`](../evals/results/D25-A/comparison.json) 对比首轮平台结果；[`final-metrics.json`](../evals/results/D25-A/final-metrics.json) 按原 task/version/source/raw-record 摘要叠加独立行为。原 `report.json` 的 PENDING_D21_B 字段保留，最终行为结论另列。

## 输入、配置、分母与有效差异

原 9 项顺序固定为 SHOW-01/02/03、TASK-01/02/03、CAT-01/02/03；故障固定为 CODE-01/02/03、ENV-01/02。分母始终是 9、3、2。原提示词、名称、数据模式及故障定义逐字节核验；未从可用记录反推分母。

| 冻结文件 | 首轮与本轮共同 SHA256 |
| --- | --- |
| requirements.json | `ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a` |
| faults.json | `4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13` |
| run-config.json | `6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054` |

Provider/model 均 `deepseek/deepseek-flash`，每任务 3 修复轮、12 模型请求、20 工具槽、50,000 运行时预算 token、12 分钟；单请求输出上限 4096、framing 512。无 provider retry/fallback。Node 24.22.1、pnpm 12.6.0、Java 21.0.12.1、Docker 29.9.2；每样本独立 Maven/JVM、全新 PostgreSQL 17.6、受限 Docker 构建及 Chromium 验证。

**配置文件完全相同，不声称物理执行环境完全相同**：首轮 checkout 为 ISOLATED，本轮为已提交且作用域干净的 IN_PLACE；整个真实命令的 sourceBytesUnchanged/headUnchanged 均 true。首轮受控镜像 ID `sha256:9fed2819…`，本轮真正使用的预检镜像 ID `sha256:69f03674…`，完整值在两批 `preflight-1.json`。本轮独立网络探针在 runtime prepare 前观察到的 `sha256:95c58979…` 不是实际批次构建镜像。既有 prepare-runtime 按锁定 Dockerfile 重建，没有升级依赖、修改镜像定义或关闭隔离。不同代码提交、网络状态、checkout 与镜像 ID、模型随机性均限制因果解释；相同供应商模型名称也不提供内部权重版本证明。

## 真实结果与样本变化

| 指标 | D21 首轮 | D25 本轮 | 判断 |
| --- | ---: | ---: | --- |
| 首轮验证成功，0 修复 | 3/9（33.33%） | 6/9（66.67%） | 增 3 个 |
| 平台最终 READY | 3/9（33.33%） | 8/9（88.89%） | 增 5 个；平台目标达到 |
| 独立需求行为 | 历史 B 报告 3/9 | **7/9（77.78%）** | 本轮目标未达；历史消费者 revision 不同，不作严格因果比较 |
| 代码故障按约定修复 | 0/3 | **1/3** | 未达全部 3 项 |
| 环境故障按约定停止 | 1/2 | **2/2** | 达到 |
| 完整记录 / 计划 | 14/14 | 14/14 | 无缺失、无样本 JVM 异常 |

首轮平台失败分类为 MODEL_TRANSPORT×6；本轮为 MODEL_OUTPUT×1（TASK-02）。故障不混入 9 个需求。历史 B 行为来源 `evals/browser/evidence/real-batch.json`（revision `c140ad8e…`）；本轮独立消费者为本卡执行提交，不重新命名历史结果。

| 样本 | 首轮平台 | 本轮平台 / 修复 | 本轮独立行为 | 具体解释 |
| --- | --- | --- | --- | --- |
| SHOW-01 | READY | READY / 0 | PASS | 原成功保留 |
| SHOW-02 | READY | READY / 1 | PASS | 首次 listitem 定位 ACTION_TIMEOUT；实际源码改动后重建/浏览器通过，验收动作未改 |
| SHOW-03 | MODEL_NETWORK | READY / 0 | PASS | 本轮到达模型并完成真实生成链路 |
| TASK-01 | READY | READY / 0 | PASS | 原成功保留，增删/计数/刷新持久化通过 |
| TASK-02 | MODEL_NETWORK | FAILED / 0 | FAIL | 两份 done 提议分别非法 target、空 expectText；未到真实 VERIFY，不计生成成功 |
| TASK-03 | MODEL_NETWORK | READY / 0 | PASS | 原购物列表要求及持久化行为通过 |
| CAT-01 | MODEL_NETWORK | READY / 0 | PASS | 原筛选/详情行为通过 |
| CAT-02 | MODEL_NETWORK | READY / 0 | PASS | 本轮完整生成及独立行为通过 |
| CAT-03 | MODEL_NETWORK | READY / 1 | **FAIL** | 平台动作通过，独立详情断言拒绝遗漏原需求简介的版本 |

可复现的改善/失败样本：

- **SHOW-02**：原始 record 的第一份 draft 为 `098006fb…`，`AGENT_ACTION_TIMEOUT → CODE → REPAIR`；最终 `323c3209…`，修复 1 轮且 actions 相同；两个真实候选及截图均保留。展示的是本轮实际修复成功，不推断它单独解释总成功率变化。
- **FAULT-CODE-01**：缺失模块导入 APPLIED → 首次 VERIFY FAILED/CODE → REPAIR → READY，1 轮、actions 不变、源码摘要改变；全部 13 项检查通过。原首轮该样本在 PLAN 网络失败，不能把原失败说成“代码不可修复”。
- **TASK-02**：原始第 4 回复把 value 放进 target，平台 `done.rejected INVALID_TARGET/index=8`；第 5 回复把空串用作 expectText，仍 AGENT_ACCEPTANCE_INVALID。离线原回复重放 2/2 被未修改的 runner 校验器拒绝，见 `diagnostics/TASK-02.json`。没有删掉非法断言后重跑它。
- **CAT-03**：独立浏览器期望详情包含“基于原生 ESM 的极速前端构建工具。”，实际只有扩写简介；保留 `behavior/CAT-03/page.png`、`trace.zip`、原源码和完整错误。平台 READY 不改写，需求级记失败。需求简介和既有断言均未修改。
- **FAULT-CODE-02**：类型错误确已注入，但 done 的空 expectText 连续被拒，未冻结/VERIFY，0 修复；故障行为失败，不能从 APPLIED 推断代码修复能力。
- **FAULT-CODE-03**：第 4 回复为 1039 UTF-8 字节、297 输出 token 的非法 JSON；Node 语法重放拒绝，原模型错误保留。未到注入点。除语法错误外的根因 UNKNOWN，不归咎为截断；原回复及哈希在 `diagnostics/FAULT-CODE-03-reply.txt`、`fault-replay.json`。
- **ENV-01/02**：真实确认容器 CLI 不可用 / 回环代理拒绝；前者 VERIFY/INFRASTRUCTURE、0 修复、失败后无文件工具；后者只有 1 次请求、MODEL_NETWORK/MODEL_INTERFACE、usage UNKNOWN、0 文件工具和修复。没有无限改代码。

## 用量（与开发 agent 分账）

| 范围 | 请求（已知 / 未知） | 已知输入 / 输出 / 合计 | 精确总量 |
| --- | ---: | ---: | --- |
| 首轮全部 14 项 | 38（28 / 10） | 93,324 / 10,899 / 104,223 | UNKNOWN |
| 本轮 9 需求 | 43（43 / 0） | 148,268 / 24,049 / 172,317 | 172,317 |
| 本轮 5 故障 | 17（16 / 1） | 49,816 / 9,391 / 59,207 | UNKNOWN |
| 本轮全部 14 项 | **60（59 / 1）** | **198,084 / 33,440 / 231,524** | **UNKNOWN，≥231,524** |

唯一未知调用为按设计未到达 provider 的 ENV-02。预算计费另为 **241,477**，不是实际消耗；缓存命中已含在输入中，不重复相加。需求耗时中位数 24.1s、最大 44.8s，9 个时间全已知；需求修复共 2 轮。日志/SQL/model_calls 与平台 meter 一致性差异为 []。

无模型网络预检、独立源码重建、原数据库还原、在线交接预检均新增模型请求 0；六项真实编辑尚未执行。完整门禁为 deterministic-mock，模拟调用/token 累计未汇总为 UNKNOWN，不以 0 冒充。开发 agent input/output/total 均 UNKNOWN：本会话没有精确计量来源，60,000 是预算，不是实测；无法据实判定 70% 阈值。

## 验收、复算与阶段门禁

命令工作目录均为仓库根。`record-final.mjs` 的 `command.json` 记录原生退出码、开始/结束、固定 HEAD、实际源码字节哈希、日志哈希；私有完整日志在 `.local-data/d25-a/commands/`，公开数据在 `evals/results/D25-A/commands/`。最初权限/目录准备失败保留于 `setup-incidents.json`，未算作执行过测试。

提交格式检查曾把原始 CRLF 日志判为尾空白（exit 1）。原始字节未重写；仅新结果目录按已有不可变证据先例使用 `-text -whitespace`，平台源码/测试仍启用格式检查，实际构建/浏览器/失败断言没有削弱。最终提交前检查单独核验。

| 用例 | 命令 / 原生退出码 | 结果 / 证据 |
| --- | --- | --- |
| T1 原 9 项无替换 | `node scripts/eval/record-final.mjs verify <本轮批次>` / 0 | **PASS**，184/184；`commands/2026-10-29T10-21-49.488Z-verify/command.json` |
| T2 ≥8/9 最终成功 | `node tests/eval/d25-a-run-replay.mjs <本轮批次>` / **1** | **未通过需求级验收**：平台 8/9，独立行为 7/9；`behavior/command.json`、`report.json`、截图/trace。原消费者同时处理编辑，六项 NOT_EXECUTED，整命令 FAILED 保留 |
| T3 3 代码 + 2 环境故障 | `node scripts/eval/final-comparison.mjs <首轮> <本轮> <新输出>` / **1** | **FAIL**：代码 1/3、环境 2/2；`comparison.json` 与原 `report.md` 全检查项。首次 shell 随后的 Get-Content 退出 0 不等于该 Node 原生退出 0 |
| T4 全部指标可复算 | `node scripts/eval/record-final.mjs report-check <本轮>` / 0；`node scripts/eval/final-metrics.mjs <本轮> evals/results/D25-A/behavior/report.json evals/results/D25-A/final-metrics.json --check` / 0 | **PASS（可复算）**，不表示质量达标；`commands/2026-10-29T10-21-50.893Z-report-check/command.json`、`final-metrics.json` |
| 最终指标写入 | `node scripts/eval/final-metrics.mjs <本轮> <行为报告> <新输出>` / **1** | 原始事实生成 HOLD；不是工具执行异常或成功 |
| 评测确定性测试 | `node scripts/eval/record-final.mjs unit` / 0 | 最终 **44/44**，0 skip；`commands/2026-10-29T11-04-18.735Z-unit/command.json`。新增 6 项放入既有 driver/report.test，根静态入口自动覆盖，无根脚本改动；此前 43/43 记录保留 |
| 负向对照 | `node scripts/eval/record-final.mjs mutation` / 0 | 最终 12/12 破坏均检出，未变异副本先通过；`commands/2026-10-29T11-04-28.459Z-mutation/command.json`；首次记录保留 |
| 实际失败回复复现 | `node tests/eval/d25-a-acceptance-repro.mjs <TASK-02-wire> <新输出>` / 0；`node tests/eval/d25-a-model-failure-repro.mjs <私有批次> <新诊断目录>` / 0 | 原非法 actions/JSON 均继续被拒；`diagnostics/`。不作为成功样本或额外模型请求 |

原四阶段入口以 `node scripts/eval/record-final.mjs gate` 运行，gate HEAD `311a96f`，19:26:40–20:03:19。**四阶段及聚合全部 exit 0**，源码字节及 HEAD 不变，9 张测试改写的历史截图按原字节还原。80 份本轮 JUnit 合计 385/385，完整日志哈希实测复核通过；规范证据 `gate-summary.json` 和 `commands/2026-10-29T10-26-40.171Z-gate/command.json`，日志 SHA256 `f966503f2cb704146657842c697eaf2d45ce7cf03e4003a6cea742efb8068212`。

| 阶段 | 本轮状态 |
| --- | --- |
| pnpm verify:static | exit 0；全量点 57 Node + 201 前端及 lint/typecheck/build；最终增量点 58 Node + 201 前端全部通过 |
| pnpm verify:api | exit 0；385/385，0 failure/error/skip；本次 PreviewPlatform 1/1，但历史 502 原因继续 UNKNOWN |
| pnpm verify:runner | exit 0；268/268，0 fail/skip，真实 Docker/Vue/Chromium |
| pnpm verify:e2e | exit 0；75/75，完整产品流程 PASSED/browserExitCode=0 |
| 本地 ci:gate / 远端 ci-gate | **exit 0 / 用户已明确授权公开交付，最终 HEAD 的远端结果须看任务附加草稿 PR，不预填 success** |

本卡自查发现新指标关联器也缺逐行 mode 守卫，先保留合成反例 `finalizer-red.json`，再于 **`b877fca`** 修复：每行必须 REAL、原平台分母/ID/行数完整为 9，CLI 定稿前必须通过批次完整性。实际本轮行均为 REAL，质量数字没有改变，原 final-metrics 逐字节复算 exit 0。受影响的 unit 44/44、mutation 12/12、原 `pnpm verify:static`（58 Node/201 前端）均在 b877fca 重跑通过，证据 `commands/2026-10-29T11-04-*`；没有生产运行时或四阶段入口改动，API/runner/e2e 无受影响变更，不重复付费或全量门禁。后续仅 provenance 标签、审计工具与证据/交接，不继承为新 HEAD 远端检查。

## D26 待修与同日交接

| ID / 优先级 | 最小待修范围、负责人及验收 |
| --- | --- |
| D25-A-F1 / P1 | D26-A：TASK-02 与 CODE-02 的非法/空文本断言。最小生产范围为 GENERATE 的动作约束反馈/提示；先用保存的原提议复现，继续严格拒绝非法动作，再证明新合法提议进入真实验证；不得改 schema/删失败断言凑分。`prompts`/API 生产改动超本卡范围，拆独立修复 PR，不在评测卡静默修改 |
| D25-A-F2 / P1 | D26-A + B：CAT-03 列表/详情必须保留需求指定简介，扩写不能替代。针对原字段和独立浏览器断言验证；保持原样本与原判据。最小提示/生成约束修复另 PR；本卡原失败保留 |
| D25-A-F3 / P1 | D26-A：CODE-03 非法 JSON；以原 1039 字节回复为 MRE，调查真实 provider/protocol 提示；不得容错解包、补 JSON 或无限重试，修复后完整新批次验证 |
| D25-A-F4 / P2 | D25-B：`validate.mjs` 未核对每行 mode，MOCK 行可被 REAL 索引计为 6/6，见只读互审及反例；作者修复后重查变化与受影响测试 |
| D25-A-I1 / 阻塞 | D25-B：六项真实编辑及公开页面/封面/下载/录屏。当前原三个基底均 READY，真实 API 还原身份通过，在线只读预检 6/6 READY；不得把预检计为编辑成功或把本机 API 当公网 |
| D25-A-I2 / 阻塞 | 本卡的最终精确 HEAD 必需检查、B 对 A 的独立审查/批准及最后启用 PR 的组合联调；真实门槛失败继续 HOLD，不合并 |

原数据库导出及不可变私有文件保留在 `.local-data/d21-a/batches/2026-10-29T10-12-17Z-real-4e8e6f51/retained/`；还原运行时 `.local-data/d25-a/runtime/`，API 只绑定回环。公开身份/保留责任在 `runtime-handoff.json`，六项预检/依赖顺序在 `live-handoff.json`。A 负责保留至 B 完成终态采集并确认归档摘要；会话/登录凭据/数据库密码/模型密钥只留私有目录，不进入 PR。运行时可用性是本轮预检现场结论，接手前仍须再探测。

门禁后的只读时效复核：API 仍在线，旧 owner 会话读请求返回 **401**；原 6/6 预检是 19:26 的事实，不是长期有效承诺。真实编辑前须在原执行提交固定检出上重新还原/登录并复核，不修改认证策略；原导出、恢复身份及不可变数据继续保留。

同伴审查：[`review-D25-B.md`](../evals/results/D25-A/review-D25-B.md) 按“阻塞问题 / 建议 / 已核验内容”记录，含精确文件位置和复现。B 的 4/4 专项由 A 独立执行，精确 HEAD 六项远端检查 success 已核对；真实证据仍缺，模式反例复现，不批准。未向对方发送消息或把私密会话写到外部服务。

**公开授权与远端检查**：首次推送因自动审批要求具体载荷公开授权而未执行，未通过其他方式上传。用户随后明确同意将这批约 5.2 MB 的评测交付公开至 `Echo-love928/CodeLess` 并创建草稿 PR；据此使用正常 Git 推送和 PR 创建流程，逐文件清单见 `publication-snapshot.json`。最终 HEAD 远端检查独立产生，本报告不预填 success；公开授权不解除真实质量 HOLD。
