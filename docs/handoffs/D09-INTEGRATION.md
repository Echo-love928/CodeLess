# D09 A/B 独立集成交接

日期：2026-10-04（Asia/Shanghai）。任务：D09-B 互审修复与最后启用接线。
分支 codex/d09-integration-preview；独立 worktree C:/Users/12058/.codex/worktrees/d09-integration-preview/CodeLess。
基线 origin/main f80ee105bd8207a65bcc46c9ce61f0eaf5497c26，2026-10-04 实际 fetch 后仍相同。
输入 A 草稿 #19 提交 5f29b335157fdbb3565b4e63be987cdd3c24a3c3；B 草稿 #20 互审修复提交 9e268846cb1f219c60c4ecac058b536c3470db58。候选为本交接所在 PR 的精确 HEAD；git rev-parse HEAD / gh pr view --json headRefOid 可核对。两份输入已合入该独立分支。原 main 指针、受跟踪内容及原 .idea/ 均保留。

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

## A 只读互审

- 阻塞问题：真实模型完整验收仍未成功。A已记录严格TS构建失败（AGENT_BUILD_EXIT）及修正提示词后MODEL_NETWORK；本轮没有重试付费模型，未批准A/B或合并。公网wildcard DNS/可信TLS签发、正式服务部署及另一人批准仍是外部前置。A的宿主桥外部强制终止后Docker orphan回收限制仍按其交接保留，未声称本预览service解决全平台worker清理。
- 建议：正式运行以受保护的固定roots/服务账号保留源、receipt、browser证据与产物并统一实施保留策略；预览mapping只自动撤销和回收本进程句柄，不删除其他任务数据。详细配置/上限/短期bearer logout行为见infra/preview/README.md。
- 已核验内容：AgentLoopIntegrationTest的8项在完整集成门禁复跑，覆盖多文件mock、模型伪造success/禁止工具、source/artifact/receipt/browser/截图哈希、真实构建失败保留旧READY、完成事件绑定确切version/build、不变性/租约/取消/预算/未知usage。审查AgentEvidence、AgentLoop.advance和原SQL commit，真实结果复核与原租约仍是READY前置；新增catalogue不会提升状态。测试命令pnpm verify:api（通过状态见下面门禁记录）。没有修改A受跟踪实现或提交批准。

## 用量与剩余限制

个人开发agent input/output/总tokens无可用实测计量，记未知，不编造60,000预算使用率。新增CI模型provider为deterministic-mock，usage仍未知而非0；不计为模型效果验收。真实运行模型用量另见A已提交runtime-usage.json（原9次尝试、8次已知+1未知，已知input14867/output4107/reportedTotal18974，统计不完整），不与开发tokens合并。
可复现确定性全链完成；真实模型成功、公网资源与正式同伴批准仍待完成。保持Draft，不自行发布、批准或合并main。

## 本地门禁进程诊断

首次 pnpm ci:gate 的 static、API99/99、runner37/37 与 E2E29/29断言通过，但浏览器命令在结果输出后返回Windows原生退出码3221226505（外层-1073740791），因此ci-gate仍为真实失败。full-gate.log/.exit保留，不将断言通过等同命令成功。读取近期Windows Application Error未找到对应node错误；开启NODE_OPTIONS原生fatal report及DEBUG=pw:webserver后，单独pnpm verify:e2e退出0，29/29，明确记录webServer正常终止，未生成fatal report。该原生异常尚无可重复根因，不能宣称已修复；保留本地稳定性风险，完整门禁随后带相同诊断完成，退出0（见下表）；原异常的根因仍未确认。没有降并发、改版本、跳断言或吞退出码。

## 最终本地四阶段门禁

最终命令 pnpm ci:gate，保留NODE_OPTIONS fatal-report和DEBUG=pw:webserver诊断；退出0，末行all stages passed。完整日志full-gate-diagnostic.log/.exit；commands.json为已提交可移植摘要。最初失败full-gate.log/.exit与独立E2E诊断均保留，未改门禁代码或吞异常。

| 阶段 | 真实最终结果 |
| --- | --- |
| pnpm verify:static | 0；契约8类、前端34项、lint/类型/生产打包通过。 |
| pnpm verify:api | 0；真实PostgreSQL99/99，0失败/错误/跳过；含A8项和真实nginx完整平台链。 |
| pnpm verify:runner | 0；37/37，0失败/跳过，真实受限Docker及新注册边界。 |
| pnpm verify:e2e | 0；Chromium29/29；真实两版产物、隔离iframe/刷新/故障路径通过。 |
| pnpm ci:gate | 0；四阶段实际串行完成。 |

B修复提交9e26884的远端六项success，运行37190045251。集成草稿推送后以其精确HEAD的新六项Checks为准；本地success不替代Linux CI与同伴审批。PNG已实际查看、字节及摘要核验后导出，没有凭据URL、cookie、TLS私钥或模型key被提交。
