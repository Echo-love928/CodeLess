# D09 A/B 独立集成交接

日期：2026-10-04（Asia/Shanghai）。任务：D09-B 互审修复与最后启用接线。
分支 codex/d09-integration-preview；独立 worktree C:/Users/12058/.codex/worktrees/d09-integration-preview/CodeLess。
基线 origin/main f80ee105bd8207a65bcc46c9ce61f0eaf5497c26，2026-10-04 实际 fetch 后仍相同。
输入 A 草稿 #19 提交 502edfb17e1d87e34deac42b0fd1bd03f1add724（初次集成输入为5f29b33）；B 草稿 #20 互审修复提交 9e268846cb1f219c60c4ecac058b536c3470db58。候选为本交接所在 PR 的精确 HEAD；git rev-parse HEAD / gh pr view --json headRefOid 可核对。两份输入已合入该独立分支。原 main 指针、受跟踪内容及原 .idea/ 均保留。

## 授权与公共维护登记

用户明确回复“本次一起完成，使用独立集成分支验证（推荐）”，授权补齐常驻注册、生命周期、公共契约与部署接线。登记本集成分支为新增 preview schema/examples、contracts/openapi.v0.json、scripts/validate-contracts.mjs 和 tests/infra/preview.test.mjs 的本轮唯一维护者；仅新增必要预览操作、fixture校验和测试发现入口。未修改锁、CI、迁移、auth/model/tools/既有业务模块。A 的代码除原分支合入不另改写；队列修复在 B 同步 A 的已验证单文件，不吞异常或移除唯一索引/并发断言。

## 已完成内容

- PreviewRegistryController.java：固定内部只读 catalogue，loopback+独立服务key；SQL只纳入 ACTIVE/VERIFIED/已完成exit0 SUCCEEDED/READY FINISHED 的确切关联，无路径或签名key响应。
- registry.mjs、main.mjs：私有journal、source manifest、runner receipt、artifact manifest/bytes、browser report、PNG绑定校验后打开本进程 live D08 handle；1秒同步、失联/3秒过旧拒绝、移除与回收撤销、重启复核、关闭句柄，32版本/256MiB有界。无HTTP注册或客户upstream。
- PreviewReadiness.java、PreviewController.java：未配置、未注册、网关失联或不同build/source/artifact返回503，不签发；平台session/cookie不转发控制面。未改变真实READY裁定。
- 公共OpenAPI、preview-credential schema和正/反例已同步；真实API响应在整链验收中实际按schema校验；前端可信port由B修复保留。
- infra/preview/：可信host Spring启动配置、常驻服务示例、已验证renderer、固定版本非root只读 nginx TLS overlay。平台只代理公共api/v0；/internal拒绝；preview独立站点，不代理平台API，无请求query日志/cache；私有key不挂nginx或生成容器。
- PreviewPlatformIntegrationTest + platform.acceptance.mjs：真实登录/UI提交/独立PostgreSQL/调度/明确mock两文件/真实Docker/Chromium/真实签发/nginx TLS/iframe链；重启恢复、回收撤销/签发503和真实存储/会话隔离。原分离测试的API/签发fixture标签保持。

## 验收与失败记录

真实命令均在本worktree执行，Java21、Node24.16.0、pnpm12.6.0、既有Maven/Docker/Playwright版本；冻结安装不改锁。

| 用例 | 命令与结果 | 证据 |
| --- | --- | --- |
| 整链 T1/T3、重启/生命周期 | Maven -Dtest=PreviewHttpTest,PreviewPlatformIntegrationTest test，退出0，2/2；随后切换实际nginx profile并执行 Maven -Dtest=PreviewReadinessTest,PreviewRegistryHttpTest,PreviewPlatformIntegrationTest test，修复后退出0，3/3、0skip。 | .local-data/d09-integration/platform-first.log/.exit 与 deployment-fixed.log/.exit；可移植 platform-acceptance.json、authenticated-platform-preview.png。无平台API或签发fixture，模型仍为mock。 |
| 私有注册失败/有界/回收 | node --test tests/e2e/preview/registry.acceptance.mjs，最终退出0，3/3，包含receipt/source/artifact/report/PNG损坏、路径越界、hardlink、未知exit、错误绑定、catalogue注入/重复、容量拒绝、失联和3秒过期、重启、删除回收。 | registry-fixed.log/.exit；此suite是明确host fixture，不证明模型或真实构建。 |
| T2/T4 与加载失败 | 既有gateway/access suite、两份不同真实Vue产物的隔离浏览器用例在完整门禁中重跑，拒绝过期/版本篡改，刷新读正确版本，资源失败显示错误；没有删除断言。 | 2026-10-03已有可移植报告；本轮原始组件证据 .local-data/d09-integration/component-evidence。 |

新注册suite首次发现健康检查未接入请求处理（1失败、2通过），修正后3/3；最初结果在本任务工具输出，最终日志单独保留。实际nginx整链首次退出1：测试进程重启使用新随机端口，而ingress upstream仍固定；修复测试以同一固定端口/接口重启，并等待新的真实签发响应后断言iframe。同期内部catalogue测试依赖未配置的demo seed而失败，改用该fixture自己创建的用户。deployment-first.log/.exit保留真实退出1及原失败，未将旧失败改写为成功或重复重试掩盖问题。第一次Node TLS整链成功也保留，不冒充nginx部署结果。

## A 首次只读互审（5f29b33 的历史）

- 阻塞问题：真实模型完整验收仍未成功。A已记录严格TS构建失败（AGENT_BUILD_EXIT）及修正提示词后MODEL_NETWORK；本轮没有重试付费模型，未批准A/B或合并。公网wildcard DNS/可信TLS签发、正式服务部署及另一人批准仍是外部前置。A的宿主桥外部强制终止后Docker orphan回收限制仍按其交接保留，未声称本预览service解决全平台worker清理。
- 建议：正式运行以受保护的固定roots/服务账号保留源、receipt、browser证据与产物并统一实施保留策略；预览mapping只自动撤销和回收本进程句柄，不删除其他任务数据。详细配置/上限/短期bearer logout行为见infra/preview/README.md。
- 已核验内容：AgentLoopIntegrationTest的8项在完整集成门禁复跑，覆盖多文件mock、模型伪造success/禁止工具、source/artifact/receipt/browser/截图哈希、真实构建失败保留旧READY、完成事件绑定确切version/build、不变性/租约/取消/预算/未知usage。审查AgentEvidence、AgentLoop.advance和原SQL commit，真实结果复核与原租约仍是READY前置；新增catalogue不会提升状态。测试命令pnpm verify:api（通过状态见下面门禁记录）。没有修改A受跟踪实现或提交批准。

## 用量与剩余限制

个人开发agent input/output/总tokens无可用实测计量，记未知，不编造60,000预算使用率。新增CI模型provider为deterministic-mock，usage仍未知而非0；不计为模型效果验收。真实运行模型用量另见A已提交runtime-usage.json（原9次尝试、8次已知+1未知，已知input14867/output4107/reportedTotal18974，统计不完整），不与开发tokens合并。
可复现确定性全链完成；真实模型成功、公网资源与正式同伴批准仍待完成。保持Draft，不自行发布、批准或合并main。

## 本地门禁进程诊断

首次 pnpm ci:gate 的 static、API99/99、runner37/37 与 E2E29/29断言通过，但浏览器命令在结果输出后返回Windows原生退出码3221226505（外层-1073740791），因此ci-gate仍为真实失败。full-gate.log/.exit保留，不将断言通过等同命令成功。读取近期Windows Application Error未找到对应node错误；开启NODE_OPTIONS原生fatal report及DEBUG=pw:webserver后，单独pnpm verify:e2e退出0，29/29，明确记录webServer正常终止，未生成fatal report。该原生异常尚无可重复根因，不能宣称已修复；保留本地稳定性风险，完整门禁随后带相同诊断完成，退出0（见下表）；原异常的根因仍未确认。没有降并发、改版本、跳断言或吞退出码。

## 初次集成的本地四阶段门禁（4e8bd41）

最终命令 pnpm ci:gate，保留NODE_OPTIONS fatal-report和DEBUG=pw:webserver诊断；退出0，末行all stages passed。完整日志full-gate-diagnostic.log/.exit；commands.json为已提交可移植摘要。最初失败full-gate.log/.exit与独立E2E诊断均保留，未改门禁代码或吞异常。

| 阶段 | 真实最终结果 |
| --- | --- |
| pnpm verify:static | 0；契约8类、前端34项、lint/类型/生产打包通过。 |
| pnpm verify:api | 0；真实PostgreSQL99/99，0失败/错误/跳过；含A8项和真实nginx完整平台链。 |
| pnpm verify:runner | 0；37/37，0失败/跳过，真实受限Docker及新注册边界。 |
| pnpm verify:e2e | 0；Chromium29/29；真实两版产物、隔离iframe/刷新/故障路径通过。 |
| pnpm ci:gate | 0；四阶段实际串行完成。 |

B修复提交9e26884的远端六项success，运行37190045251。集成草稿推送后以其精确HEAD的新六项Checks为准；本地success不替代Linux CI与同伴审批。PNG已实际查看、字节及摘要核验后导出，没有凭据URL、cookie、TLS私钥或模型key被提交。
## 2026-10-04 同步 A 502edfb 与组件复审

在既有独立集成分支合入 A `502edfb17e1d87e34deac42b0fd1bd03f1add724`，保留 A 原提交和分支，不改写其源码。合入后的源码候选 `5ca5e64358113f83a4c80fe79bdae2f0020fc24b` 与 A 的 Agent 实现、提示词、生命周期/生成测试及工具 fixture 逐字一致；本节所在后续提交仅更新本交接与集成证据。基线 main 仍 f80ee10，原工作区受跟踪内容、分支指针和 .idea/ 保留。

- 阻塞问题：此前 LocalBuildGateway 中断时先关闭 executor 的 P2 已解除。新实现先终止自有父子进程，再取消 stdout/stderr 读取并 shutdownNow；原中断标志保留，不等待 executor.close。真实模型效果仍未通过：A 本次实际 TS2322（页面 Work 缺组件 WorkItem 所需 year）及后续 MODEL_NETWORK 都为失败；files.read 提示修订的效果没有成功证据，本次未重复付费请求。完整模型验收仍阻塞，不以本节 mock 整链代替。
- 建议：报告标注改为 NOT_EXECUTED_BY_THIS_TEST，2026-10-03历史证据保持原样。正式部署仍需保护固定roots/账号、公共DNS/TLS，以及外部宿主强杀后的 Docker orphan 回收；本次进程清理修复没有宣称解决容器孤儿回收。
- 已核验内容：生命周期4/4、Agent Loop8/8、队列7/7、真实鉴权平台预览1/1均在本次门禁通过。中断/超时报告均为进程存活数0，中断标志按预期保留；正常协议仅为明确transport fixture。确定性流水线的数据库、Docker与Chromium真实，伪造/错误摘要、构建失败与确切版本/事件断言没有削弱。新导出的 A 双文件源码/PNG摘要重新核验一致。公共契约、CI、锁、迁移、其他运行模块未修改，既有工具权限/预算/无自动重试上限保持。

已按用户“作者修复后…按照仓库规则批准”的授权提交 [A PR #19 组件代码 APPROVED](https://github.com/Echo-love928/CodeLess/pull/19#pullrequestreview-5406219747)，精确提交502edfb；审查时A六项CI success、base与main一致、0未解决讨论。该批准限定组件实现，不是完整模型/最终功能验收。B PR #20 的9e26884也已由A正式批准；本集成PR #21仍须他人独立审查，没有自批或合并任何main。

本次第一轮 `pnpm ci:gate` 实际退出1：本机 Docker Desktop Linux engine 未运行，Testcontainers/runner构建及两项浏览器测试因无法连接引擎失败；静态与新增生命周期4项通过。保留 `.local-data/d09-integration/a-revision-502edfb/ci-gate.log/.exit`。从实际docker CLI安装路径定位并隐藏启动已有Docker Desktop，确认 `docker info` 成功后再执行；没有安装/升级/改配置、改断言或覆盖失败日志。

恢复后的完整 `pnpm ci:gate` 退出0、末行all stages passed：契约8类/前端34、API103/103、runner37/37、Chromium E2E29/29，0失败/错误/跳过。日志 `ci-gate-recovered.log/.exit`，受影响类与日志摘要见 `tests/e2e/preview/evidence/2026-10-04/a-revision-502edfb/peer-recheck.json`。

真实登录→UI需求→独立PostgreSQL→明确mock多文件→真实Docker/Chromium→真实签发→常驻registry→实际nginx TLS→iframe再次通过，且重启恢复/回收撤销/内部接口拒绝/平台存储与会话隔离断言保持。新报告 `a-revision-502edfb/platform-acceptance.json` 和 `authenticated-platform-preview.png` 已逐字节核验截图摘要并实际查看；不覆盖初次集成报告，platformApiFixture/signingFixture均false，modelQualityAccepted仍false。

真实模型累计计量沿用A新提交：14次尝试，12次已知+2次未知；已知input22695/output6047/reportedTotal28742，完整总量UNKNOWN。此复查0次真实模型调用；开发agent input/output/总量无逐任务实测，仍未知。

后续推送的精确PR HEAD须重新通过远端六项检查；状态通过PR与实际CI run读取，旧HEAD成功不能替代。A #19与集成 #21保持Draft。真实模型成功、更新后的集成同伴审查和正式部署前置仍待完成，未合并或发布，未修改main。

## 2026-10-04 独立自动复审与真实模型整链入口

针对“真实模型无成功证据、PR #21待独立复审”，在原独立集成分支完成三个fresh-context子代理只读审查。固定parent f83895c及增量修复范围、发现位置/复现方法/已核验内容详见 tests/e2e/preview/evidence/2026-10-04/real-preview-readiness/independent-review.md。这是独立自动审查，不替代另一GitHub账号批准；本账号是PR作者，保持Draft且不自批/合并/发布。

修复实际复现的P2：nginx默认error_log在upstream拒连时记录含credential的完整URL。仅preview server关闭error_log，保留平台诊断；实际nginx502+唯一合成marker无日志回归通过，再复核同端口重启、真实签发、iframe隔离和回收撤销。文档明确catalogue超1000条导致全局503，此为既有安全容量行为，未扩容或改变fail-closed。

新增显式 `RealPreviewPlatformAcceptanceIT`，命令 `services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealPreviewPlatformAcceptanceIT test`（Java21）。入口使用真实deepseek Bean、真实平台UI登录和需求提交、独立数据库与调度，经原Docker/Chromium/真实签发/常驻registry/nginx TLS/iframe及全部生命周期断言。默认Surefire不选择 *IT、原平台CI测试仍显式mock。付费请求仍受既有12次/20工具/50,000tokens/12分钟约束，没有自动重试或改变模型实现。API之外的prepare/browser/runner测试子进程移除模型key/name；可见内容采用innerText；先写modelQualityAccepted=false，仅SQL证明真实provider/配置model、每条成功非空usage、READY及全部断言成功后写true，范围限定一条静态Ada展示页需求。失败保留 started/task/model-calls/platform.log，不覆盖旧失败。

用户选择“配置deepseek-flash后通知”，尚未给出已配置确认，本次0次新计费模型请求。Java21与Provider相同HTTPS客户端无Authorization GET收到401，确认当前DNS/TLS/连接可达，但不证明鉴权或模型效果。真实成功仍受阻，不将新的mock报告当模型证据。个人开发tokens实测未知；历史14次运行时模型用量分账保持，未改历史报告。

新增Java类已编译，受影响PreviewPlatformIntegrationTest 1/1退出0；本次完整ci-gate退出0，原命令与源码摘要见 real-preview-readiness/commands.json，私有日志 .local-data/d09-integration/real-preview-readiness/ci-gate.log/.exit。新截图已查看、摘要/字节复核；portable平台报告仍明确modelQualityAccepted=false、API/signing fixture=false。精确新HEAD远端必需检查仍需重新读取；main保持f80ee105不变。


## 2026-10-05 B review of A PR22 and iframe diagnosis

Task D09-B / independent integration branch `codex/d09-integration-preview`; original integration baseline `2abc81ec95b54e39e6decc573f54fb94e39285fb`, reviewed A candidate `5ec8adbc316c15c9c46a780aa1a7819dffbd8d18`. Main remains `f80ee105bd8207a65bcc46c9ce61f0eaf5497c26`. Synchronize the source changes on the integration branch; do not merge PR22 or push to main. Existing historical reports remain unchanged.

Read-only peer review uses three independent reviewers (security, testing and adversarial). Source/PNG byte digests, exact completion version/build/verification/source/artifact bindings and 18 recorded provider calls agree. Closed transport envelopes still fail; real successful build with ambiguous Chromium target still cannot become VERIFIED/READY. No submitted secret or permission expansion was found. Exact A head had all six remote checks success in run37218786913. The old ce83b04 OOM classification failure remains unexplained; success on a later head is not its fix.

Blocking review finding P2: generate policy unconditionally required a dependency component as the first file, while the plan contract allows `components=[]` and one page. B formally requested changes on PR22 at its exact head. On the integration branch, make the first-file rule conditional and add a real single-page build/browser/READY completion-binding test. A's source branch is unchanged; this update needs peer review. No claim that the prompt conflict was reproduced with a paid model.

Add bounded allowlist-only loading diagnostics, with query/header/cookie/raw-error redaction and cleanup despite a diagnostic write failure. Three diagnostic boundary tests pass. Replay A's committed source through the real login/API, PostgreSQL, Docker, controlled Chromium, actual signing, resident registry, nginx and iframe. The initial incorrect fixture usage reservation and a short test-harness generation deadline are retained as failed diagnostic setup attempts; neither is labelled as a production iframe failure. Production model reservations and runtime budgets are unchanged. Recorded usage is a prior-call fixture, not new measured runtime usage.

The un-delayed replay and 10 affected Agent tests pass (combined 11/11, exit0). Replay's source sha256:e134292e23b28c436b23d8f200b089af92e613798518c87e0a6d5fefb5b605da and artifact sha256:a753801f3a70f7b4dabafcf297f32e36f700ca8a569186f50af83f8638d7c39c match A. Real preview returns 303 then document/assets 200, with valid loaded origin/source; storage/session isolation, refresh, restart and retention all pass. Screenshot was viewed. Provider is explicitly recorded-source-replay, model quality false, API/signing fixtures false. This does not prove a fresh real-model full chain; A's paid iframe timeout remains unknown.

Current B process/user/machine configuration contains no model key/name, and A's private failure log/runtime directory is not present in this checkout. Asked for a safe credential path/local configuration and original private evidence path; never print or paste keys. Continue deterministic work. This B turn has zero new paid calls; A's 18 calls/input46289/output4634/total50923 remain separately recorded, historical unknown usage stays unknown, developer input/output/total measurement UNKNOWN. Draft PRs; no merge or publication.

Portable reports and safe network evidence: `tests/e2e/preview/evidence/2026-10-05/pr22-diagnostics/`; private original command logs and exit files: `.local-data/d09-integration/pr22-debug/`. Subsequent delayed comparison and final gates are recorded in this directory's commands/report files and the final delivery.


Final B local update: six-times-25-second replay also exits0 (1/1), real issuer200/bootstrap303/document+assets200/valid loaded message; original paid iframe timeout remains NOT_REPRODUCED/UNKNOWN. Final `pnpm ci:gate` exits0: contracts8/frontend34, API105/105, runner37/37, E2E29/29, no skipped cases. A subsequent test-only isolation fix gives opt-in replay its own database/private roots/ports and restores the default platform test unchanged; affected combined-class verification is recorded in commands.json. All initial setup failures retain their actual exit/log digests. Security and adversarial affected-scope rereviews found no remaining issue; test-isolation rereview and exact new remote-head checks are read separately. Zero new paid calls. Still need real model credentials/private original failure evidence on B or execution of the updated diagnostic entry in A's environment, followed by success evidence and formal peer approval of updated PR21.
