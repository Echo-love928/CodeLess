# D25-A｜原六项真实编辑及原机公网验收：HOLD

本轮新增2元只用于原EDIT-01至06，真实编辑及独立构建/浏览器已6/6。没有付费重跑九需求，没有增加付费样本。生成质量仍6/9；新生成修复候选REAL NOT_EVALUATED。公网、封面、门禁失败分别保留，不合并。

## 任务、分支及提交

- 任务D25-A；当前评测分支`codex/d25-a-six-edits`，PR82基线`cf80bed8dc180a1df3517d0ed1e15799b819737b`，实际编辑启动评测HEAD`b6d141e4486935a60e6e09d1ce0742d3686a9707`。
- 编辑生产候选/PR83固定`fb79c402de6b66bc849e87b6880bf955488f8032`；B评测器/PR81固定`6e79faf6464f33c260d8c8e47efdce3b0b6dddd2`。A独立复核B单元139/139，native0。
- 另拆生产草稿[PR84](https://github.com/Echo-love928/CodeLess/pull/84)，分支`codex/d25-a-entry-json-fixes`，候选`380811d5270a72706fad0b1a74b7ffab8b97735a`，基于fb79；只改两个提示、两个测试和一个真实路由夹具。该候选未用于本次编辑，也未进行真实生成复评。
- VPS原API版本`57c768fea4352376babd80ce14ff1ca1b91a54e5`未部署新代码。发布采用原A候选PublicationService、既有受限SSH网关和VPS受限worker；不声称整台VPS运行fb79。未改服务器服务、配置、防火墙、公共契约、锁或CI。

## 真实结果与分账

| 项目 | 结果 / 证据 |
| --- | --- |
| 六项编辑 | **6/6 READY且独立行为通过**，≥5/6达标；`records/`、`behavior/report.json`、`sources/EDIT-*/source.diff`、12组前后截图/trace |
| 顺序/边界 | 01→02→03→05，04/06独立；每次以新版本可信mapping重新选择实际组件；各只改实际选中单一源码文件 |
| 新模型用量 | **14次，全部KNOWN**；input58608/output6819/total65427；`model-audits/`及`execution/*-journal.json`、原API终态记录 |
| 新预算 | 独立上限2元；保守上界**0.171768元**、剩余1.828232元；actualCny=null，未知实际扣费，不声称实付；`execution/budget.json` |
| 原九需求 | 同一原样本平台READY7/9，B修正CAT-03探针后独立行为**6/9**，未达8/9。旧5/9保留；源码重放新增生成请求0 |
| 原故障 | 第三轮代码1/3、原环境0/2；ENV-02单列首次补验通过继续单列，不覆盖原13/14、不完整或预算拒绝，不继承较早轮次成绩 |
| 越权/历史 | 已登录第二普通USER实际15次越权请求全404，模型行数不增；六项历史前置版本源码/快照/验证不变；`security-download/report.json` |
| 真实下载 | 原owner三份ZIP HTTP200；版本/源码/构建/content摘要、全部清单字节、CRC独立验证；`security-download/*.zip`及报告；校验器`scripts/eval/verify-source-export.py` |
| 未覆盖失败 | 六项没有自然FAILED编辑任务，因此失败任务的latestReady/先前发布保护**NOT_COVERED**；不能用404或本地夹具替代，不额外付费造失败 |

价格基于[官方价格表](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，按峰值、全部输入按未命中算上界，无假定缓存/时段折扣。原第三轮51调用47已知4未知及上界1.759246元独立保留，不合入本次2元，不把UNKNOWN归零。个人开发agent input/output/合计均UNKNOWN，计量来源UNKNOWN，与平台用量分开。

## 公网、封面与演示

原owner实际通过已鉴权API触发3个已验证不可变版本，原生发布与公网探测均PUBLISHED，新增模型0。首次发布因Windows SSH缺OS身份元数据FAILED，旧ID/失败保留；只读最小复现定位、补充明确白名单OS元数据并回归后，才创建新用户发布请求。没有覆盖失败或放宽SSH主机校验。

| 最终编辑 | 公网URL | 浏览器/刷新 |
| --- | --- | --- |
| SHOW-01 / EDIT-05 | https://d9977ce0dbbd48bf49930ac48967fe427.sites.codeless-publish.top/ | PASS；累计姓名/正文颜色/四向padding/三卡圆角 |
| SHOW-02 / EDIT-04 | https://da2efd532f47c812086626d62625068d6.sites.codeless-publish.top/ | **FAIL**；首次JS、单列复核CSS在现有3秒请求期限内超时。复核看到新按钮和确认，仍不能记完整公网验收成功 |
| TASK-01 / EDIT-06 | https://d5f5f5fdcf6b789eca3a4b69aaf993045.sites.codeless-publish.top/tasks | PASS；标题及原TASK-01增删/计数/勾选/LocalStorage刷新行为。根`/`仍是原欢迎占位页 |

证据`publication/`及`public-browser/`。浏览器只接收真实VPS DNS及真实HTTPS下载、逐清单核对长度/摘要的字节，保留TLS授权、证书和远端IP；没有使用本地fixture证明公网，没有关闭DNS/IP/证书/代理隔离。系统fake-IP负向仍拒绝，早先IPv6回环失败也保留。公网浏览器最终2/3，SHOW-02单列复核失败不被删除。

封面用B原生受限队列及默认真实capture worker，12秒/最多2次不变；原生队列2/3 SUCCEEDED，SHOW-02两次CAPTURE_FAILED后不再重试。**可用功能封面只有SHOW-01**：TASK-01的成功PNG是根欢迎占位页，不冒称任务功能封面。有效owner/第二USER元数据及图片绑定仅在B私有adapter上核验；生产cover HTTP/OpenAPI尚未安装。`covers/report.json`和`covers/jobs/`保留全部状态。

真实视频交付以[DEMO.md](DEMO.md)的实际文件为准；截图、脚本、录屏配置不能代替WebM。视频仅回放已编辑/已发布版本，不声称录到此前付费生成或编辑过程。

## 最小修复、命令、原生退出与门禁

PR84收窄JSON转义及固定路由/文件配对提示，原非法JSON在真实原生AgentLoop/隔离DB重放继续严格失败，不修补、去重或重试。TASK-03原`/tasks`失败、原计划`/`通过保留，另行手工页面提议真实构建/浏览器通过，不算模型质量提升。

| 用例 / 命令 | 原生退出码及结果 | 证据 |
| --- | --- | --- |
| 原六项一次性执行 | **1**；编辑6/6，但整命令因原生成6/9 HOLD | `launch-started.json`、`launch-result.json`、`execution/` |
| B `node evals/browser/run.mjs --batch <原批次> --edit-records <本目录records>` | **1**；需求6/9、编辑6/6，真实Docker/Vue/Chromium；新增模型0 | `behavior/report.json`、`execution/invocations.json` |
| 新生产受影响Maven | 红**1**（4项2失败）→绿**0**（15/15） | `deterministic/commands.json`，完整原日志私存 |
| `-Dtest=D25PrivateWireIT -Dd25.wire=<原wire> -Dd25.batch=<原批次> test` | **0**，2/2；明确离线mock传输、真实DB/原生循环；合成用量不入真实账本 | `deterministic/*-original-wire.json`及命令记录 |
| `node tests/agent/repair/d25-entry-json/route-fixture.mjs <原批次> <B检出> <新输出>` | **0**；原失败和独立手工提议成功同时满足断言 | `deterministic/route/report.json` |
| `node --test tests/eval/{cny-budget,budgeted-batch,edit-budget,ssh-hosting-bridge}.test.mjs` | **0**；21/21，无skip | `deterministic/commands.json`，原生工具输出chunk6d36d5 |
| `node scripts/eval/check-six-edit-delivery.mjs` | **0**；逐原记录复算6/6、14次、65427token、上界0.171768元，输出明确HOLD | `consistency.json`；`deterministic/checker-mutations.json`含6组先通过原副本、再检出MOCK/UNKNOWN/重复ID/错任务/源码篡改/费用归零，负向均native1 |
| PR84 `pnpm verify:static` | **0** | `production-gate.json` |
| PR84 `pnpm verify:api` | **0**，401/401，0 failure/error/skip | 同上，本轮JUnit摘要 |
| PR84 `pnpm verify:runner` | **0**，268/268 | 同上 |
| PR84 `pnpm verify:e2e` | **1**，74/75；既有截图worker强制回收确认断言失败 | 同上；`tests/e2e/share/screenshot.acceptance.mjs:142`；完整原日志和trace私存 |
| PR84 `node scripts/ci-gate.mjs` | **1 / FAILED**，精确HEAD/源码字节不变 | 同上 |
| 本卡评测分支 `node scripts/eval/record-final.mjs static` | **0 / PASSED**；源码字节不变，含新增评测/传输代码 | `../commands/2026-10-30T13-03-21.020Z-static/command.json`；HEAD b6d141e加当时待提交源码，完整公开快照另由审计绑定 |

E2E单次最小诊断返回CAPTURE_TIMEOUT、cleanupConfirmed=true，未复现原失败，`deterministic/cleanup-diagnostic.json`不是新的全量gate，不消除失败。不删断言、不放宽150ms测试、不重复全量直到变绿。远端CI只认精确HEAD实时结果，另存PR回执，不继承旧提交success。

## 互审、保留、待办

互审B6e79：CAT-03新增正反例及原139项独立通过，原九样本/冻结判据不变；无新代码阻塞，但真实总质量继续HOLD。建议区分生产接口与私有adapter、根占位封面与功能封面、脚本与实际视频。B接手清单见[PEER-TASK.md](PEER-TASK.md)，A不代B批准或登记补验接受。

A保留运行中数据库、原三应用、六个新版本、原失败/导出、全部私有不可变根及新`retained-after-edits`/`retained-after-publication`快照直至B确认归档；回执`retention-receipt.json`、`publication-retention-receipt.json`。会话过期只正常登录；本机受控账户密码恢复、第二普通USER不改变原所有权/角色/版本。按最新约定A原机执行、B看去秘密证据，不再要求跨机密文/密钥。不要恢复旧导出覆盖成果或清理当前运行时。

D26/B待办：原生成6/9与故障门槛、PR84 REAL未评、原13/14不完整、SHOW-02网络/封面失败、TASK-01根封面占位、生产cover接口未安装、自然FAILED编辑保护未覆盖、本地E2E回收断言失败、精确HEAD门禁及独立互审。剩余预算不自动授权任何额外付费任务。未自批、未改main、未合并。

PR84远端精确HEAD380811d5270a72706fad0b1a74b7ffab8b97735a：2026-10-30T13:14:37Z核对六项必需CI均success，见production-ci.json。本地E2E74/75、ci-gate1原失败仍保留，不能用远端Linux成功抹去本机清理问题；真实生成6/9与其他质量阻塞均不解除。

评测源码提交157f83f4eecd681f6e035ee629f3f2b66a99dc88后的受影响静态复验：node scripts/eval/record-final.mjs static，native0，源码/HEAD不变；../commands/2026-10-30T13-13-00.461Z-static/command.json。新增复算器在该源码上实测native0及6组负向检出；随后仅增加报告和回执。

公开授权现已收到：用户明确选择“允许公开本次新增交付并更新草稿PR #82”。此前未推送/检查未执行的状态保留于dc57814历史提交；原始编辑、生成与失败记录字节不变。本次仅更新授权说明及最终逐文件审计，按正常快进更新PR82。新HEAD的远端必需检查须独立产生，不能继承旧cf80bed；最终状态以PR实时检查和PR描述中的精确SHA回执为准。
