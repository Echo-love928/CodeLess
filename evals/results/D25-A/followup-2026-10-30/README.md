# D25-A｜2026-10-30 修复复评与 B 增量审查

**尚未修复全部质量阻塞，最新实测 HOLD：独立需求 6/9（目标≥8/9），代码2/3，环境2/2。** 当前提交86885629d5113e299e6be274c4b28bf50c1d61e6，精简提示后的真实模型验收 **NOT_EVALUATED**，不能继承165e31c的成绩。 两轮未达到门槛；不启动第三轮付费评测，按任务卡第8条先与同伴协调。报告/命令完成不等于真实质量通过。旧失败与固定样本未改，未自批、未合并。

## 分支、候选与最小范围

- 评测分支 codex/d25-a-final-evaluation / 草稿 PR #82；生产修复独立分支 codex/d25-a-quality-fixes，基线 main=5de2e6c。F1=a9d5b4b（反馈+回归）、F2=5cb0405（原文保留）、F3=c1b4923（严格JSON提示）；依据首轮真实失败再做9a5334c/a201256（缩短新增提示、稳定按钮定位、非空选项及累计筛选状态）。
- 第一轮真实候选 ad4c8f04ae6fd5857f5e32ccaedc709c4a088b54；第二轮/最终实测候选 **165e31c0fec532fc910396257b8d468499ae91e3**。每轮固定9+3+2，各一次完整批次；无样本替换、子集补跑或外层重试。原评测a863b76的全部文件逐字节仍相同，见 round1/round2-provenance.json。
- 生产改动明确拆独立PR#83：仅 AcceptanceActions、两个新回归测试所在类、生成/修复提示，共4文件。没有 schema/公共契约/锁/CI/版本/权限/隔离/预算变更；动作接受规则和严格重复键解析继续拒绝错误。计划将#82以生产修复分支为base分开审查，质量未通过的改动不启用、不批准。

用户已明确授权新增两轮评测证据公开交付；推送和精确HEAD检查以PR82实时提交及最终远端记录为准，不由授权推断完成。

## 结果与具体变化

| 本卡子项 | 本轮结果 |
| --- | --- |
| D25-A-01 | 原9需求与3+2故障各完整执行两轮，14/14记录、每轮184/184；真实质量未达标 |
| D25-A-02 | 原冻结输入/配置/分母一致，失败分类与已知/未知用量分账保留 |
| D25-A-03 | 原需求7/9→最新实测6/9，代码故障1/3→2/3；逐项失败/修复实例和原版本保留，不拼接两轮成功样本 |
| D25-A-04 | 真实值和未解决项如实入报告；第三轮前需同伴复核，新精简候选真实验收NOT_EVALUATED，HOLD |

| 批次 | 平台 READY | 独立需求 | 代码故障 | 环境故障 |
| --- | ---: | ---: | ---: | ---: |
| 原10-29：4e8e6f51 / a863b76 | 8/9 | 7/9 | 1/3 | 2/2 |
| 修复轮1：f1960e81 / ad4c8f0 | 6/9 | NOT_EXECUTED / UNKNOWN | 2/3 | 2/2 |
| 修复轮2：c3368088 / 165e31c | 6/9 | **6/9** | **2/3** | **2/2** |

原需求行为7/9→最终6/9，未改善；平台8/9→6/9也退步，不能挑选两轮各自成功行拼成高分。相同输入配置不证明模型随机性/执行环境完全相同，不能把全部变化严格归因于单个提示。

- F1 **部分修复**：格式反馈两个回归先红2/2失败，再绿；连同原动作校验9/9。CODE-02两轮均真实注入→VERIFY→REPAIR→READY（1轮/2轮），不能用测试fixture冒充。TASK-02首轮已进入VERIFY但猜测新增条目ID，三轮后失败；第二轮第3回复重复键，9618字节，严格解析在column4706拒绝。F1未整体关闭。
- F2 **未得到真实验收证明**：提示要求保留原简介，但两轮CAT-03均未READY；第二轮先有列表/详情Vitest两个同名heading，修复又使原Vite定位超时。不能以源码里存在简介代替详情浏览器通过。
- F3 **部分进展、仍阻塞**：两轮CODE-03均不再卡在注入前非法JSON，实际异常注入与修复已发生，但轮1因矛盾筛选动作/预算失败，轮2的text=科技匹配筛选按钮和两条分类（3个目标），三轮仍失败。只移除注入异常不等于故障验收通过。
- 新回归CAT-02：详情打开后heading=云间咖啡同时匹配列表h3与详情h2，三轮未解决；一次修复引入signatureDrink跨文件字段不一致。保留所有版本、错误及诊断。
- 具体来源：[failure-diagnostics.json](failure-diagnostics.json)、第二轮 samples/*/record.json/source，以及 [round2-behavior/report.json](round2-behavior/report.json) 的真实重建/Chromium截图trace。第二轮6项READY独立行为均通过；3项平台失败仍失败，不改为0或成功。

## 原配置、分母与用量

原三个冻结文件逐字节相同，SHA256见round2-final-metrics.json。deepseek/deepseek-flash；3轮修复、12模型请求、20工具槽、50,000运行时token、12分钟，输出4096/framing512；无provider retry/fallback。Node24.22.1/pnpm12.6.0/Java21；受限Docker及每样本独立真实PG/浏览器。首次Docker未运行时未启动样本；恢复同一已安装29.9.2后完整预检。轮2预检超过10分钟被原驱动拒绝，重新完整通过后才实际启动。首次失败和过期拒绝保留于commands与setup-incidents.json，均无模型请求。

| 新运行时账本 | 请求（已知/未知） | 已知input/output/total | 精确total |
| --- | --- | --- | --- |
| 修复轮1 | 71（70/1） | 255419/44883/300302 | UNKNOWN |
| 修复轮2 | 69（68/1） | 240182/46313/286495 | UNKNOWN |
| 新两轮合计 | 140（138/2） | 495601/91196/586797 | **UNKNOWN，≥586797** |

两次ENV-02按设计未到provider，用量UNKNOWN，不能填0。原10-29的60请求/已知231524单独保留在历史报告，不合入开发token；最终轮保守预算计费296448另列。开发agent input/output/total均UNKNOWN，计量来源未知；60,000是预算，无法据实判定70%阈值。确定性门禁的模拟调用/token总计未汇总，记UNKNOWN；离线复现/恢复/只读预检新增真实模型请求0。

## 本卡验收与真实命令

以下路径以仓库根为工作目录；<batch2>=evals/results/generation/runs/2026-10-30T02-41-32Z-real-c3368088，<out>=evals/results/D25-A/followup-2026-10-30。

| 用例 | 命令 / 原生退出 | 结果及证据 |
| --- | --- | --- |
| T1 原9项无替换 | node scripts/eval/record-final.mjs verify <batch2> / 0 | 两轮各184/184，14条记录；pipeline.json、commands/02-52-08.963Z-verify（完整时间戳目录） |
| T2 ≥8/9 | node tests/eval/d25-a-run-replay.mjs <batch2> <out>/round2-behavior / **1** | **FAIL，独立6/9**；report/command/screenshots/traces。六项真实编辑NOT_EXECUTED，不计入需求分母 |
| T3 3代码+2环境 | node scripts/eval/final-comparison.mjs <原批次> <batch2> <新输出.json> / **1** | **FAIL，2/3、2/2**；round2-comparison.json，原故障逐项checks保留 |
| T4 可复算 | node scripts/eval/record-final.mjs report-check <batch2> / 0；node scripts/eval/final-metrics.mjs <batch2> <out>/round2-behavior/report.json <out>/round2-final-metrics.json --check / 0 | PASS，仅表示复算一致，不表示质量通过；pipeline.json |
| 格式回归 | Maven -Dtest=D25ProposalFeedbackTest,AcceptanceActionsTest test / 0 | 原实现新测试exit1（2失败）→修复后9/9；feedback-red/green.json |
| 评测守卫 | node scripts/eval/record-final.mjs unit / 0；mutation / 0 | 第二轮候选44/44、12/12；commands/2026-10-30T02-40-21.210Z-unit、02-40-25.263Z-mutation |
| 严格JSON原回复MRE | node tests/eval/d25-a-strict-json-repro.mjs <out>/diagnostics/TASK-02-duplicate-key-reply.txt <新输出.json> / 0 | 原严格Jackson仍拒绝；strict-json-repro.json，sha256=583e3156…；不容错覆盖重复键 |
| 来源不变 | node tests/eval/d25-a-followup-provenance.mjs <batch2> <真实command.json> <新输出.json> / 0 | 原a863b76失败文件、冻结输入不变；执行HEAD/源码字节不变，round2-provenance.json |

## 四阶段及ci-gate

165e31c首次gate发现提示扩容引入确定性预算回归，已保留部分JUnit（277测试、23failures/5errors、0skip）后停止自有进程树；原生exit1，API终态UNKNOWN_INTERRUPTED，runner/e2e未执行，详见interrupted-gate.json。没有沿用它声称门禁通过。后续精简提示为generation5190/repair1758字节，低于原5338/1763；实际失败的生成/CSRF/预算及严格动作/协议专项 **38/38、exit0**，见budget-regression-green.json。此精简版是新的源码候选，真实模型验收NOT_EVALUATED，待同伴协调后重跑完整批次。

原 ci:gate 提交de7c40ff1f5d5b32328a195067bfdf88cbbfa9e2，原生退出 **0**，状态 **PASSED**；证据 evals/results/D25-A/commands/2026-10-30T03-18-37.784Z-gate/command.json，源码字节/HEAD 执行期间未变化=true/true。

| 阶段 | 原生退出 | 状态 |
| --- | --- | --- |
| pnpm verify:static | 0 | PASSED |
| pnpm verify:api | 0 | PASSED |
| pnpm verify:runner | 0 | PASSED |
| pnpm verify:e2e | 0 | PASSED |

完整门禁计数：static58 Node/201前端；API81份JUnit、387/387、0failure/error/skip；runner268/268；e2e75/75及完整产品流程PASSED/browserExitCode0。实际日志SHA256=83f5149d8a613efee74e8178899a141be0cc26b93c8d74f455f62779d6deb5c9；9张历史截图已还原。完整来源及生产4c9455d与组合de7c40f的Git内容/现场字节一致性见final-gate-summary.json。

生产修复PR83精确4c9455d六项远端检查全部success（03:46:43Z快照remote-fix-checks.json），只属于该生产提交；不能继承到本PR尚未更新的新远端HEAD，也不能替代真实质量。

远端精确最终HEAD检查以草稿PR实时状态为准；旧9ad40a0成功不继承至新候选。CI即使成功，需求6/9和故障2/3仍阻塞合并。

## B增量只读审查与联调

B PR#81/6ecf3f5050c47e24ffe211a32e60460a2a6c033d的逐行mode代码缺陷已关闭：A独立6/6、原六MOCK成功行反例被拒绝，全部九行/缺失与未知模式有覆盖。精确HEAD六项远端success，见peer-unit/peer-counterexample/peer-checks.json；只查增量和受影响范围，无生产/锁/CI/权限变动或削弱断言，未发现秘密。真实编辑、公网页面/封面/下载仍NOT_EXECUTED，保持HOLD，未正式批准。详见../review-D25-B.md。

原运行时已在精确a863b76独立检出上恢复并合法重新登录，六项只读预检6/6 PREFLIGHT_READY，原13个模型调用身份/账本未变，新模型请求0，真实编辑执行0；见 [runtime-handoff.json](runtime-handoff.json)。这是A原设备的历史候选，不能证明新4c9455d/de7c40f同候选编辑或公网验收。会话仅在 .local-data/d25-a/runtime-2026-10-30/session.private.json，值不公开；跨设备回环地址不可直接使用，接手前须再次检查在线性和正常会话时效。A保留导出/私有根至B终态采集及归档确认。

## PR摘要、待接手与协调

本次把最小格式反馈和提示修复拆成可审查提交，完整保存两轮真实失败、原版本、调用账本与独立需求复评；目标未达到，不能宣布阻塞已修复。生产修复和评测PR均保持草稿，不自批、不合并，不启用发布。

- D26-A/B需先协调：重复键生成、详情/列表全局定位重复、冻结动作状态一致性、修复跨文件字段保护；已准备具体复现和反馈草稿 [PEER-FEEDBACK-REQUEST.md](PEER-FEEDBACK-REQUEST.md)。第三轮前先确定最小契约/上下文差异与确定性测试，不靠重复模型调用碰运气。
- 用户已明确授权发布文字协调评论，已提交并更新：[PR82成员B复核请求](https://github.com/Echo-love928/CodeLess/pull/82#issuecomment-6514266087)。该评论只含授权的故障摘要和接手条件，没有附待授权的原始评测载荷；尚待B独立意见，不将发出请求当作批准。
- B接手：使用原运行时合法会话完成真实编辑、公网页面/封面/下载及录屏；不以本次恢复/预检替代终态。
- 仍需：另一人独立复核、最终HEAD必需检查、无未解决讨论；质量阈值先达标才可能解除HOLD。私有SQL、会话、密钥不进入PR。
