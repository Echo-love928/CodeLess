# D25-A｜第三轮实测交付：13/14，HOLD

## 当前结果与提交

任务分支 `codex/d25-a-final-evaluation`，本轮执行器基线 `3fabca6df082fcb94079a39038fbc7ab16cbdfd2`；固定生产候选/PR83为 **fb79c402de6b66bc849e87b6880bf955488f8032**。main本地引用保持 `944738c3c4f035f3d503281fecba9f96a09fdf88`；候选源码未改，未自批/合并。原始批次 `evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b`，08:15:31Z至08:26:31Z。

审批服务与账户/普通TLS/JVM/Docker预检已真实恢复后才执行；此前审批阻塞是历史状态。账户证明在私有根，不公开余额或凭据。

| 指标 | 本轮真实观察 | 证据 |
| --- | --- | --- |
| 计划/实际执行 | 原14项保留；13个JVM原生退出0；ENV-02启动前预算拒绝；外层退出3 | launch-result.json、controller/controller-state.json |
| 平台首次/最终READY | 6/9、7/9，未达8/9 | 原批次report.json |
| 需求行为 | A自测5/9，B独立验收未执行；不以平台READY代替 | behavior/report.json、behavior/command.json（native1） |
| 代码故障 | 1/3：CODE-01通过；CODE-02 PLAN 503未到注入；CODE-03已注入、REPAIR 503 | 原报告faults.results及各record.json |
| 环境故障 | 0/2：ENV-01在PLAN遭503，未证实约定的构建故障；ENV-02未执行 | 原报告；ENV-02/invocation-result.json |
| 完整性 | 177/178，native1；缺ENV-02原始记录 | ../commands/2026-10-30T08-33-26.586Z-verify/command.json |
| 费用 | 保守累计上界1.63467元，剩余0.36533元，实际费用UNKNOWN | controller/controller-state.json |

原driver写完14个调用结果标记后产生 `batchComplete=true`，同时原报告记录数为13。这里明确区分结构完成标记与真实执行：**批次不完整**。不删标记、不补空记录、不改原报告。原 `final-metrics.mjs` 因完整性失败native1，最终定稿文件未创建；`diagnostics.json` 仅诊断且永久标注HOLD/不允许定稿。ENV-02已有调用标记但没有JVM，冻结恢复规则禁止直接resume；其首次实际单列补验例外仍待用户明确确认，详见 `SUPPLEMENT-ENV02-PLAN.md`，当前未执行。已运行13条不重跑。

## 本卡子项与具体失败

- D25-A-01：原九需求全部真实执行；3代码+2环境故障位置完整，4/5故障实际执行，最后一条受预算阻塞。不能登记为完整完成。
- D25-A-02：原需求、故障、run-config SHA与首轮一致；模型仍deepseek/deepseek-flash，分母9/3/2。3修复轮、12请求、20工具、50000预算token、12分钟、单次输出4096均不改。金额护栏不提高运行时上限、不增加provider重试。具体冻结摘要在diagnostics.json及两个comparison文件。
- D25-A-03：D21原首轮c25b722平台READY3/9→本轮7/9；SHOW-03、TASK-03、CAT-02、CAT-03由失败转READY。但TASK-03和CAT-03未过A行为复测，不能把这4项全记需求修复成功。相较上一完整165e31c的需求行为6/9，本轮A自测5/9；配置/网络/模型随机性限制因果解释。首轮对比在first-round-comparison.json，上轮对比在comparison.json，两者因候选不完整/质量不足均native1，不改统计口径。
- D25-A-04：真实结果、未知与D26待办已记录；当前报告为实测诊断，完整定稿及质量门槛仍HOLD。

| 待修/待复核 | 原始位置与最小复现 | 判定/后续 |
| --- | --- | --- |
| TASK-02非法JSON | samples/TASK-02/record.json：model.invalid，PARSER/SYNTAX，1:451，digest 8475724ac863f4bf5816124be299c53384c2b237c92bb87fe241aeb067b78928 | GENERATE失败；保留严格拒绝，不修补/重试 |
| CAT-01非法JSON | samples/CAT-01/record.json：PARSER/SYNTAX，1:969，digest b6414761b5bf954b5aa5a340718ef2d61234bb7f7efdef310c28081dbb679205 | PLAN失败；需独立生产修复与确定性回归后再谈新付费 |
| TASK-03路由 | source/v1/src/pages/HomePage.vue实现购物清单，但冻结/tasks展示“任务/待添加任务”占位；behavior/TASK-03/page.png、trace.zip；cases.mjs:145起 | textbox等待超时；修复计划与受控路由一致性，不能更换固定测试路由 |
| CAT-03字段探针 | ToolCard.vue:13将类别和许可证放同一p，另一个p为简介；冻结探针期望≥3项，实得2；behavior/CAT-03/page.png、trace.zip | 当前行为失败保留；请B复核语义展示与既有探针的结构假设，后续筛选/详情/刷新未证实，不冒称字段不存在 |
| CODE-02/03、ENV-01 503 | 各record.json的model.invalid：PROVIDER/HTTP_STATUS_503；CODE-03在第二个REPAIR请求失败且注入已应用 | 原失败不重试；CODE-03不是“注入前失败”，未知用量不归零 |
| ENV-02预算拒绝 | 原invocation-result.json：exitCode=null、launchError=CNY_BUDGET_NOT_STARTED、recordPresent=false | 原批次不完整；仅单列首次补验方案待明确确认，保留原拒绝 |

上表source路径在原批次 `samples/<ID>/` 下。行为复现不调用模型：`node evals/browser/run.mjs --batch <batch>`，需真实Docker/Vue/Chromium；本轮原生命令和native1已保存，禁止为了变绿反复运行或修改冻结断言。B独立验收是另一次独立核验，不与A自测混计。

## T1–T4、测试与阶段门禁

以下 `<batch>` 为上文原批次，`<out>` 为本目录。完整命令/时间/native退出/日志SHA见final-checks.json；不因预期失败把native1写成0。

| 验收/验证 | 命令 | 原生退出/结果/证据 |
| --- | --- | --- |
| T1 原样本不换不删 | `node scripts/eval/verify-batch.mjs <batch>` | 1；177/178，原9完整，但ENV-02缺记录导致整批失败；原verify command.json |
| T2 ≥8/9 | `node evals/browser/run.mjs --batch <batch>` | 1；A真实行为5/9，目标不满足；behavior/command.json和report.json |
| T3 原3+2故障行为 | 同批次原GenerationEvalIT各样本命令 | 外层3；已启动13个JVM均0不代表业务通过；代码1/3、环境0/2，ENV-02未执行；controller和原报告 |
| T4 可复算 | `node scripts/eval/report.mjs <batch> --check` | 0；原报告逐字复算一致；final-checks.json的report-check |
| T4 严格最终指标 | `node scripts/eval/final-metrics.mjs <batch> <out>/behavior/report.json <new-output>` | 1；完整性前置拒绝，未生成final-metrics-NOT-CREATED.json；final-checks.json |
| 诊断复算 | `node scripts/eval/batch-diagnostics.mjs <batch> <out>/behavior/report.json <out>/diagnostics.json --check` | 0；只校验诊断一致，不解除完整性/质量HOLD |
| 辅助约束/加密/交接 | `node --test tests/eval/cny-budget.test.mjs tests/eval/budgeted-batch.test.mjs tests/eval/private-handoff-crypto.test.mjs tests/eval/private-handoff.test.mjs` | 0；23/23、0 skip；final-checks.json |
| 原评测单元/变异 | `node --test tests/eval/generation/*.test.mjs`；`node tests/eval/generation/mutation.mjs` | 0/0；44/44、12/12；实际展开的完整参数见final-checks.json |
| 本轮增量static | `node scripts/eval/record-final.mjs static` | 0；58 Node、前端测试及类型/构建通过；../commands/2026-10-30T08-46-01.108Z-static/command.json |
| 固定fb79四阶段/ci:gate | `pnpm verify:static`、`pnpm verify:api`、`pnpm verify:runner`、`pnpm verify:e2e`，原ci-gate顺序调用 | 此前固定fb79已全部native0：API397/397、runner268/268、e2e75/75+产品链PASSED；../four-fixes-2026-10-30/gate/command.json；本轮未重复全跑，源码未变 |

精确fb79远端六项CI曾核验success；评测分支新增交付未公开推送，新增HEAD远端CI状态NOT_RUN，不能继承旧6255425的success。首次report-check包装因本地私有日志目录EPERM未运行检查；final-checks内随后真实执行原report --check成功。无跳过必需断言、无Mock效果替代、无绕过合并门禁。

## 平台运行时账本（与开发token分开）

实际50条模型调用记录：47已知、3未知；已知输入147910、输出24323、合计172233为下界。总输入/输出/合计精确值均null，不用下界冒充总量；ENV-02根本无记录，另列而非填0。provider HTTP503发生于CODE-02 PLAN、CODE-03 REPAIR、ENV-01 PLAN。未知样本各保留整个0.4元上界，连同其他已知样本保守累计1.63467元；实际费用null，账户余额差额未冒充本批账单。

单列ENV-02若获明确确认，方案保留旧1.63467不动，并在原单请求/4096输出/50000总token限制下预留最多0.124576元，累计上界1.759246元；不因存在方案声称已执行或允许直接resume。B六项真实编辑的付费不在A授权内。

开发agent input_tokens/output_tokens/合计：**UNKNOWN / UNKNOWN / UNKNOWN**，计量来源UNKNOWN（无实测接口），不估造值；平台账本不合入个人开发token。

## 私密交接、B复核及PR草稿

实际保留13条原数据库/schema与私有不可变版本（包含失败无版本任务），没有ENV-02空SQL。`private-transfer-receipt.json` 记录加密与解密命令、native0、880文件/13身份校验。密文1,533,259字节，SHA256 `fbe04b2963b90b5a5b29b0160343b3abc7f8b2c7e2a15bc570805a777f1c75ce`；AES-256-GCM密钥单独私存，未显示值、未入归档、未上传。

- 密文：`.local-data/d25-a/third-2026-10-30/handoff-original13/codeless-d25-originals.enc`
- 密钥文件：同目录 `handoff-key.private.json`，**仅由用户通过另一私密途径转交**。
- 原导出：`.local-data/d25-a/third-2026-10-30/private-batch/retained`；本机运行时：`.local-data/d25-a/third-2026-10-30/runtime`，保留到B确认终态及归档摘要。会话值仅本机私有文件，不入包。
- B取得仓库本轮脚本后，在新私有目录执行 `node scripts/eval/private-handoff.mjs unpack <密文> <单独密钥文件> <新私有目录>`，先核对manifest与全部摘要，再用精确fb79和既有retained-runtime脚本恢复原SHOW-01/SHOW-02/TASK-01。不导入未知SQL，不以A回环地址/会话跨设备使用；自行合法登录，使用另行获准的模型凭据。
- A已实际恢复上述原三应用/任务/版本；`runtime-handoff.json`显示六项只读PREFLIGHT_READY、原12次调用保持不变、新模型请求0、真实编辑0；预检正常时效到期后须重检，不能继承为B真实结果。

同伴审查分类：**阻塞问题**＝本轮真实质量/完整性及B六项编辑、权限/历史保护、公开页/封面/下载未验收；**建议**＝B独立复算原报告与诊断，复核CAT-03结构假设及ENV-02单列补验提案；**已核验内容**＝A原始证据、真实构建/浏览器自测、只读版本身份/账本、加密自检。B此前对四项确定性修复的通过结论不扩大为本轮真实验收；本轮没有冒称替B复审。给B的复制文字见PEER-FEEDBACK.md。

PR82摘要草稿：在固定fb79上执行一次带2元护栏的原14位置复评，保留13条真实执行和最后一条预算拒绝；新增人民币账本、严格不完整诊断、原运行时恢复与私密加密交接。原质量未达标，23+44确定性测试与12变异通过，静态通过，完整性/最终定稿拒绝符合事实。新增原始交付公开授权尚未取得，当前不推送；PR保持草稿、HOLD，不合并。

---

# 历史：第三轮执行前准备与外部阻塞

**第三轮未启动，新增付费模型调用 0，未产生新成绩、新数据库或可交付的真实加密包。** B 已接受四项确定性回归并确认候选，真实质量仍 HOLD；不能把候选确认或本地准备测试记成真实验收通过。

固定候选 `fb79c402de6b66bc849e87b6880bf955488f8032`。本轮用户明确授权 A 执行一次原九需求＋3代码故障＋2环境故障；预算 **人民币2元仅覆盖A这14条**，B后续付费须另行确认。跨设备方案由用户确认：A生成加密包，用户私下分开转交密文文件与解密密钥。

## 可审查的准备

- `scripts/eval/cny-budget.mjs`：批次外费用护栏。按已核对的高峰输入缓存未命中2元/百万token、输出8元/百万token计算上界；不假设缓存或空闲折扣。每任务原50,000-token上限按最高价最多预留0.4元，启动前必须有完整预留额度。结束后按完整已知用量释放差额；失败调用照计，缺少调用/用量/日志时保留整任务上界，未知不改0。金额用整数纳元计算，崩溃不自动释放额度，不重试已启动样本。[官方价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- `scripts/eval/budgeted-batch.mjs`：调用固定候选自身的原驱动、原预检和原JVM命令；只在外部增加额度预留和现有保留开关。拒绝更换候选、模型、分母、提高预算、增加外层重试或误授权B付费。账户证明和审批恢复未完成时拒绝执行。没有修改固定候选的生产代码、模型协议、故障注入或3轮/12请求/20工具/50,000 token/12分钟上限。此启动器尚未完成真实运行集成，不能当真实效果证据。
- `scripts/eval/private-handoff-crypto.mjs`：AES-256-GCM跨设备加密原语；校验错误密钥、密文/标签篡改和截断，认证成功前不返回明文。实际数据库归档与加密包必须在第三轮有真实原始导出后创建，当前只验证加密原语。
- `execution-plan.json`：范围、预算归属、固定候选、保留责任与私密交接已明确。`approvalServiceRestored=false`、`accountCurrencyVerified=null` 有意保持阻塞；用户偏好“恢复审批服务后继续”不等于审批已经恢复。

## 本地验证

原生退出码均0：新费用/执行约束/加密测试18/18，无跳过；原评测测试44/44，无跳过。真实命令：

```powershell
node --test tests/eval/cny-budget.test.mjs tests/eval/budgeted-batch.test.mjs tests/eval/private-handoff-crypto.test.mjs
$files = @(rg --files tests/eval/generation -g '*.test.mjs'); node --test @files
```

测试仅使用合成计量对象和本地随机字节，不调用模型或查询模型账户，不证明模型质量。记录见 `local-preparation-tests.json`；18项完整捕获与44项工具截断摘录分别保留，摘录不冒称完整原日志。

固定候选此前已完成的397项API、268项runner、75项e2e及六项CI仍是历史已核验事实，本轮未重复全跑。新增执行启动器还没有真实预检/运行结果；也未通过提交或推送制造新HEAD的CI成功。源文件与测试目前在评测分支工作区，未提交、未合并main。

## 未消除的外部依赖

只读 `GET https://api.deepseek.com/user/balance` 和环境前置命令的提权审批未能执行：先自动审批超时，再返回 `Selected model is at capacity`；用户选定恢复后继续后，原审批通道复查仍超时。操作均在进程创建前被拦截，余额未查询，第三轮模型调用未发生。没有改用其他网络工具、取消审批、关闭TLS或换通道执行。

这属于**自动权限审批服务失败**，不是“该操作被判定不安全”。须先恢复应用审批服务，之后才可核验账户币种/资金、普通TLS/JVM/Docker预检，并更新真实证明字段。不能凭等待时间、用户预算授权或手工改布尔值冒称服务/预检已通过。

## A的保留与B的接手

1. 每个实际启动的样本启用原候选已有 `CODELESS_EVAL_RETAIN_ROOT`，在JVM及其PostgreSQL容器正常结束前导出原数据库/schema，保留私有根、不可变版本、源、日志和摘要。原容器按原隔离生命周期关闭，不能声称它仍在线；保留数据库原始导出并在同候选恢复运行时。
2. A保管全部14条原始导出与证据；为六项编辑恢复SHOW-01、SHOW-02、TASK-01的原应用/任务/版本身份。若原样本没有可用版本，明确交接失败，不拿旧a863b76版本替代。
3. 加密归档包含原批次证据、数据库与私有版本存储、逐文件清单、同候选恢复步骤和费用回执。模型API密钥及账户余额快照不入包；打包前扫描当前模型密钥字节，发现则停止。密文和解密密钥分文件，密钥不放入归档或公开仓库。
4. 用户负责跨设备私下分别传输文件和密钥。A不自动上传私密数据或发给他人。B核对密文/明文清单后，在其设备合法恢复并重新登录；A设备的127.0.0.1地址和旧会话不能当远程可用凭据。
5. B另行独立复算指标、执行需求行为及六项真实编辑/权限/历史保护，核对发布/封面/下载。B的付费不由本次A的2元授权自动启动；A在收到B终态及归档摘要确认前不清理原始保留数据。

当前真实指标仍为先前批次需求6/9、代码2/3、环境2/2；本候选 REAL NOT_EVALUATED。所有旧失败与未知用量保留。开发agent input/output/合计 UNKNOWN（无实测接口）；本轮平台付费调用0，新真实运行时token不产生，本地测试不混入平台真实账本。
