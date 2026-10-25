# 真实编辑交接：B 消费端协议

本文件规定 B 已实现的接收、预检和验收方式。2026-10-25，“保留三份原样本数据库及私有文件根，再还原到同一个在线 API、同场编辑采集”的导出、合库、原用户登录、身份/摘要核对及一次 HTTP/CSRF MOCK 编辑采集已实现并通过自测，仍没有新的真实编辑验收记录。首次完整真实批次未达标，三个编辑基底只有 SHOW-01 READY，其他两个失败照实保留。当前进度见 `handoffs/D21-ACCEPTANCE-RECOVERY.md`。批次 ID 或源码 ZIP 本身不表示可在线编辑，预检通过也不是编辑验收通过。

## A 需要交付的输入

完整的 14 样本原始生成批次保持不变，包含九个需求、三个代码故障、两个环境故障、调用账本、失败及未知 usage。B 的生成分母仍为九，不因失败缺样而缩小。

六项编辑需要 SHOW-01、SHOW-02、TASK-01 的原始 VERIFIED 版本。交接应同时包含：

- 原始批次、提交号、原始文件 SHA256 清单；三个样本的 applicationId / generation taskId / versionId / buildId / sourceDigest。
- 可访问这些**原版本**的 API、所有者会话和逐任务模型账本的管理员读取权限。会话和凭据单独通过私密渠道提供，只在环境变量中使用，禁止放入 PR、JSON、截图或归档。
- 运行时及不可变源码、构建、映射、验证和调用账本的保留约定：A 在 B 完成全部终态记录采集并确认归档摘要前不销毁数据库和文件。需要 A 明确确认保留责任人及可用窗口；B 的只读预检不能保证未来仍在线。

可选方式是双方在同一个仍存活的 API 运行时中完成实际任务并执行采集，再交付七文件采集包。必须先有真实 component-edits 任务和服务端 API 记录，之后才允许销毁数据库。现有 GenerationEvalIT 的逐样本临时数据库会退出即销毁，而且不提供这个在线 API；A 需要为新批次提供上述保留/同场采集入口。B 不会把源码导入另一个应用后冒称原版本，也不会给原源码补标识或制造编辑任务。

## 定位及六项操作

| 编辑 | 原始需求 | 页面语义 | 修改目标 | 同应用前项 |
| --- | --- | --- | --- | --- |
| EDIT-01 | SHOW-01 | 姓名标题 Grace Hopper | 文案变为 Grace Hopper · 计算机先驱 | 无 |
| EDIT-02 | SHOW-01 | 三个冻结作品标题所在卡片 | 正文颜色 #1d4ed8 | EDIT-01 |
| EDIT-03 | SHOW-01 | 同上 | 四边内边距均为 24px | EDIT-02 |
| EDIT-04 | SHOW-02 | 报名按钮 | 文案立即报名，确认行为保留 | 无 |
| EDIT-05 | SHOW-01 | 三个冻结作品标题所在卡片 | 三个实例圆角均为 16px，标题与说明保留 | EDIT-03 |
| EDIT-06 | TASK-01 | 个人待办清单标题 | 文案我的每日任务，增删/计数/持久化保留 | 无 |

六个原始 prompt 不变，见 `evals/edit/cases.mjs`。B 从语义 DOM 读取最近组件根的候选 ID，随后只用**从该不可变源码真实重建出的 catalog**解析 sourceFile，并核对服务端映射。ID、文件名和初始 CSS 均可改变；正文卡片可以属于同一个页面组件，三个共享目标必须解析为同一个可信源码组件。DOM 声明的文件路径不参与解析。fixture 文件布局只供 MOCK 源码写入器使用。

找不到语义元素记 LOCATOR_UNMATCHED；缺标识、未知 ID、禁用/重复映射及目标归属不一致分别记录 mappingReason。原生成失败、重建失败、缺编辑任务记录也分别保留。未执行仍为 `passed:null / NOT_EXECUTED`；已有记录但无法验证记 BLOCKED_VALIDATION。初始样式已经满足要求时记 BASELINE_ALREADY_MATCHES，不伪造一次可观察的编辑效果。

## B 的可执行步骤

先用原始批次重建并独立评测，命令可因真实失败退出 1，仍保留完整 report.json：

```sh
node evals/browser/record-command.mjs batch /absolute/private/A-batch
```

在运行时仍存活时设置 CODELESS_EVAL_API_URL（完整 `/api/v0/` 结尾）、CODELESS_EVAL_SESSION_COOKIE 和 CODELESS_EVAL_AUDIT_SESSION_COOKIE，然后预检：

```sh
node evals/edit/handoff.mjs /absolute/private/A-batch /absolute/private/B-run/report.json /absolute/private/new-preflight
```

预检只 GET，核验 API 当前版本、原 task/version/build/source 关联、前快照全部文件和摘要、验证报告、映射以及审计权限。任何缺失/不匹配都保留 BLOCKED，真实请求为 0。API 使用正常 TLS 校验，不跟随重定向，回环 HTTP 之外只允许 HTTPS。修复证书替换及真实证书链、12/12 探针由环境侧/A 处理；B 不修改 TLS/JDK/代理设置。

`handoff.json` 给出六个固定 prompt、实际 selection、依赖关系和初始能力检查结果。**六个初始 payload 不可同时提交**：同应用依次执行 EDIT-01→02→03→05，每次采集后将已证明的 after 作为下一项 current。EDIT-04、06 使用各自的应用。对待执行项重新运行 B 的重放/语义探测，生成基于最新已证明版本的 selection；`requests.mjs` 只构造 payload，不发 POST：

```sh
node evals/edit/requests.mjs EDIT-02 /absolute/private/current-selection.json /absolute/private/current-rebuilt-mapping.json
```

selection 和 trustedMapping 来自 B report 对应项，不接受模型提出的路径。实际组件编辑通过平台 UI 或已有 component-edits 接口提交，沿用所有者会话、CSRF、独立幂等键和 SOURCE_FILE/共享实例提示。提交者即时记录 sampleId/taskId；不自动重发不确定的付费请求。若前项失败，保留该失败并停止依赖项，不偷偷回退/恢复版本或改变样本。

任务终态后，在运行时销毁前填写 task-index.json（READY 必须填写其真实 versionId；FAILED 无版本则 null）：

```json
{"batchId":"真实批次ID","mode":"REAL","tasks":[{"sampleId":"EDIT-01","taskId":"实际任务UUID","versionId":"实际版本UUID或null"}]}
```

```sh
node evals/edit/collect.mjs /absolute/private/A-batch /absolute/private/task-index.json /absolute/private/new-records
node evals/browser/record-command.mjs batch /absolute/private/A-batch --edit-records /absolute/private/new-records
```

每次采集使用新目录；可先归档前缀任务，再在新目录采集完整索引。采集器逐项保存 index 和记录，后项读取失败也不会丢失先前记录的索引。最多六项；`index.json` 和每项 EDIT-0N.json 按 SHA256 关联。记录包含真实服务端 task/source、编辑前版本及其全部快照源码、服务端 before.mapping、验证报告和逐任务模型账本；READY 项另含编辑后版本及其全部快照源码与验证报告。**采集器不读取 after.mapping**，它由 B 在离线重建后从可信 catalog 重新绑定；快照包含构建/验证身份和产物清单，不包含原构建产物全部字节、原 runner 日志、截图和 trace。失败无后版本时 after 为 null，不伪造一份成功快照。collect 成功只表示读取保存完成，完整来源、账本和行为校验仍由 replay 执行；失败任务和未知用量不删除。

最终 B 会重新构建前后版本，验证目标实际变化、全部共享实例、任务行为及无关文件字节稳定。离线重建是独立行为验收；真正发生编辑必须由上述平台任务/版本/调用记录证明。MOCK 集成测试不得进入 REAL 成绩。保存每次失败和未知数据后才汇总九项行为、六项编辑并增量互审。旧 CI 单次 fixture 5/6 继续是 **UNATTRIBUTED（未归因）**。

## 2026-10-25 对 A 五项确认

1. **会话**：三个应用确实归同一个运行时所有者时，一个所有者 Cookie 和一个能读 `admin/model-calls` 的审计 Cookie 足够。apiReader 对所有普通读取使用前者，对 admin 路径使用后者；没有按样本切换账号的机制。当前 GenerationEvalIT 每个样本随机创建不同 owner UUID。建议新批次从生成开始使用同一批次所有者；如果还原时归并，保留原转储，另存原 ownerId → 运行时 ownerId 的迁移记录和归并范围。不能改 application/task/version/build/verification ID、源码、原任务状态和模型账本来完成归并。登录必须绑定现有的用户行，并保留 CSRF/权限校验，不另建同邮箱的无关所有者。
2. **固定工具**：一体化工具固定到 `1b8e9718140000022e31751b0b50c9c020d8af09`（PR #67），包含 handoff、requests、collect、replayEdits、语义探测和还原/执行脚本，不需要 B 进程或临时源码补丁。使用该提交完整工作树及其锁文件，按 evaluation-ui.md 准备 Node/pnpm、Docker 受控镜像与锁定 Chromium。A 运行时使用 A 最终批次记录的提交，不能以 B 工具分支替换；后续仅记录证据的提交也可整体固定使用，仍须保持批次与 API 运行时提交完全一致。只读采集/重放不需要真实模型密钥；实际 component-edits 的付费执行需要 A 运行时的密钥。初始 report → handoff 后，逐项 collect，再带全部已采集前缀运行 `record-command.mjs batch ... --edit-records ...`，从新 report.edits 对应项取 selection/trustedMapping 写入新文件交给 requests。不要把初始 handoff 的六个 payload 一次提交。
3. **归档**：完整六项时七文件包是 index + 六份记录；前缀/失败依赖链可能少于七文件，未执行项保持 NOT_EXECUTED。另保留原始完整 14 样本批次、冻结副本、原文件 SHA256、三份数据库导出/文件根及其清单、还原身份校验报告、每次 handoff/report/selection/request/task-index 的去凭据副本和命令/退出码、B 独立构建的产物清单/截图/trace。原构建与验证文件仍留在私有根，不声称七文件包覆盖所有运行时文件。会话、密钥和含凭据环境文件不进任何交付归档。归档文件本身还需要外层 SHA256 清单；收到 B 确认摘要前保留导出及数据库/文件，完成终态采集和复核确认后再销毁运行时。不是任务终态一出现就自动销毁。
4. **谁启动**：优先由 A 在持有密钥且已验证 TLS 的本机起运行时，并执行 B 固定工具，B 消费包独立复核。不要求把真实密钥交给 B。导出→合库→真实 API 登录→身份/摘要核对→一次 MOCK 编辑/采集已完成自测；真实执行仍需三个原始 READY 基底及后续在线预检。
5. **传输**：`http://127.0.0.1:<port>/api/v0/`、localhost 或 `[::1]` 满足 apiReader 的回环 HTTP 例外，配置 CODELESS_COOKIE_SECURE=false 可用于此本机运行时。服务实际绑定回环，不把 0.0.0.0/局域网地址当成回环；Cookie 应与所选主机一致，不依赖重定向。远端 API/模型仍正常 HTTPS/TLS 校验，证书链和 JVM TransportProbe 的 12/12 预检不因回环例外豁免。

建议顺序保持 A 提议：导出还原 MOCK 自测 → 环境预检全过 → 一次完整真实批次并保留三个原样本 → 在线预检及串行真实编辑/采集 → B 离线验收。此确认不放宽 50,000 预算、不追加协议重试、不批准合并。三个保留样本中若有生成失败，保持原失败并阻塞对应编辑，不替换或重跑该样本。
