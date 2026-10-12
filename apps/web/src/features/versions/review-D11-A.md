# D11-A 只读互审

## 当前复审结论：acdc183

2026-10-12（Asia/Shanghai）。A PR33精确`acdc183cf4a250df024f7109d53e5628efc79e54`，
基线/main仍`413e5b8`。仅复查4f364a3之后的测试诊断、记录器及证据差异，生产API/存储代码未变。
已提交[独立APPROVED review5486237790](https://github.com/Echo-love928/CodeLess/pull/33#pullrequestreview-5486237790)。
本批准仅覆盖A该候选，不代表B获批或允许合并；PR33仍草稿，main未改。

- **阻塞问题**：没有发现A当前代码/验收阻塞。旧B `/source`接口不一致关闭；A新定向14/14、
  精确HEAD实际CI175/175及B8640035真实面板1/1证据补齐验收缺口。原本机EIO根因仍UNKNOWN，
  旧失败未覆盖，另一机器成功不解释旧失败。公共OpenAPI及全历史来源映射仍是最终启用的维护者事项。
- **建议**：区分作者提交前4f+dirty test记录与最终acdc CI；B更新依赖后核验新候选。
  2026-10-12用户明确本轮只更新B，公共契约/迁移另交维护者，本轮不改这些公共文件。
- **已核验内容**：VersionFixtureGate:11保留第一原因；VersionHttpIntegrationTest:48/58在HTTP前
  明确NOT_EXECUTED前置失败，原T1–T4断言:92/144/157/180未弱化。record-command:47/57
  记录原生exit/signal与日志hash，非零不转成功。审查工作树独立unit9/9、contracts3/3 native0；
  A缺B专用IT的负向panel命令原生1/FAILED，无测试检查未关闭。源码/清单/报告及4张面板截图摘要已重算匹配。
  六项精确HEAD检查success；下载原始CI日志确认API175/175、版本HTTP5/存储7/新守卫2实际执行，E2E33。

复现：`node tests/versions/record-command.mjs unit`、`contracts`；负向`panel`在仅A仓库预期exit1。
真实面板在包含B IT的checkout显式运行，不能用负向用例或默认CI代替。
完整新证据见A `tests/versions/evidence/2026-10-12/commands.json`，
[精确CI run38197827472](https://github.com/Echo-love928/CodeLess/actions/runs/38197827472)。

## 历史初审：4f364a3

审查日期：2026-10-12（Asia/Shanghai）。PR：https://github.com/Echo-love928/CodeLess/pull/33 。精确候选 `4f364a323813ac7cf479bd1162db26e718ca8741`，当前 main / base `413e5b8bc40e2ccf6b5c538a9f2b4fc0f02e9ccb`。

结论：静态代码、契约和公开证据审查未发现新的 A 后端代码阻塞；本地独立 HTTP 验收失败，真实 A+B 面板联调仍有前置事项，本次不提交 APPROVED。没有修改业务代码、契约或测试，也没有评论、合并、发布或推送 main。报告及复测输出仅保存在审查工作树的忽略目录。

## 阻塞问题

1. **本地独立验收未通过；构建环境根因仍 UNKNOWN。** `services/api/src/test/java/dev/codeless/api/versions/VersionHttpIntegrationTest.java:78` 的真实 VERIFY 返回 `AGENT_BUILD_EXIT`。runner receipt `services/api/target/agent-integration/runtime/receipts/4d4df8ae-f97b-4fb9-b36b-86782fa8cc26.json` 记录真实 exitCode=1、`EIO: i/o error, scandir '/input'`、artifact=null、verification=null；没有把错误改成成功。测试共12项，7通过、3 failure、2 error、0 skip，命令退出1。由于 T1 未建立 ready/failed ID，T2/T3 的 NPE 及 T4/边界的 `/versions/null` 400 是连带失败，不能据此认定权限绕过，也不能声称独立 T2–T4 已通过。这与 B 既有 Windows EIO 证据形态相同，尚不能归因于 A 的改动。保留失败、不盲目重试、不放宽隔离；需环境/runner维护角色协调定位，再重查受影响验收。

   复现：Java21、Node24.16.0、pnpm12.6.0；Docker Desktop29.8.0 已就绪。在本审查目录设 `JAVA_HOME=C:/Program Files/Java/jdk-21.0.12.1` 并将其 bin 和 E:/nodejs 放入 PATH，`CODELESS_MODEL_PROVIDER=deterministic-mock`，移除进程模型 API key/name 与系统 Chrome channel，证据目录指向忽略目录，然后运行：

   ```powershell
   services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=LocalVolumeSnapshotStoreTest,VersionHttpIntegrationTest' test
   ```

   原始日志 `targeted-docker-ready.log`，退出文件 `targeted-docker-ready.exit`；日志SHA256 `4022b77ea3c5b71eb20001694338c795ee6aba9475ee01afe56066d4dcc59c1d`。更早一次 Docker 未启动造成初始化错误，也保留在 `targeted.log/.exit` 及复制的初次JUnit XML中；启动现有Docker后才进行本次复测。

2. **最终功能启用的接口与联调前置仍未完成，属于集成阻塞。** A 的 `services/api/src/main/java/dev/codeless/api/versions/VersionController.java:59,65` 提供 `/files` 清单和 `/files/content?path=...`；B `apps/web/src/features/source/source-api.ts:8` 尚请求建议的 `/source` 整包接口。复现：把两候选接线后，以owner选择VERIFIED版本，`/source` 没有A后端映射；实际正常读法为同versionId的 `/files` 再 `/files/content`。A `contracts/versions/README.md:13` 和交接已诚实声明，未发现 A 违背自己的接口契约。由 B/最后启用功能PR适配、维护者应用增量公共OpenAPI、完成真实session/PG/版本/源码/iframe验收。这不是要求A越范围替B修改，也不将A独立API证据当B面板验收。

## 建议

- 下次完整门禁使用能可靠写出进程退出码的记录器。`tests/versions/evidence/2026-10-11/commands.json` 已将第二轮本地 aggregate exit 保留为 UNKNOWN，做法正确；本次精确HEAD远端成功不解释旧Windows错误或丢失的本地退出码。
- `VersionHttpIntegrationTest.java:42,69,105,118,141` 使用静态ID与有序前置T1；可让后续失败明确指出前置未建立，或建立独立受控前置，以减少构建失败导致的NPE和 `/null` 误导。保留原安全断言和真实构建要求，不能跳过必需验收。

## 已核验内容

| 用例 | 具体位置与核验范围 | 结果及限制 |
| --- | --- | --- |
| T1 修改新草稿不影响旧版本 | `LocalVolumeSnapshotStore.java:119,134`；`LocalVolumeSnapshotStoreTest.java:22`；`VersionHttpIntegrationTest.java:69` | 独立存储测试7/7、exit0，覆盖原输入修改、重建store后读旧字节、禁止重复冻结。原HTTP测试还断言旧源码和旧artifact/report相等；精确HEAD CI执行通过。本地HTTP在构建前置失败，未独立完成该HTTP断言。 |
| T2 失败不能发布 | 既有 `services/api/src/main/resources/db/migration/V1__platform_data.sql:203`；`VersionHttpIntegrationTest.java:105`；`AgentRunStore.java:110` | PG触发器要求owner和VERIFIED；测试拒绝FAILED/DRAFT发布并检查preview409，VERIFIED成功，原断言保留。远端实测通过。本地失败receipt生成的版本outcome为FAILED、exitCode=1、artifactDigest=null，重算report哈希一致，未冒充可用产物；本地T2因前置缺失未完成。尚无本卡发布HTTP入口，不能把持久化约束测试称用户发布流程验收。 |
| T3 versionId读取哈希一致 | `LocalVolumeSnapshotStore.java:137,195,215`；`VersionHttpIntegrationTest.java:118`；`PreviewPlatformIntegrationTest.java:95` | 源码清单排序JSON聚合哈希、实际UTF-8字节/bytes/fileDigest逐项比对；快照读取复核source/artifact/report。独立重算公开 `preview-source-consistency.json` 两份源码哈希，preview与snapshot的versionId/source/artifact对应；PNG已查看。精确HEAD CI通过，本地HTTP未完成。 |
| T4 无权限不能读 | `VersionController.java:36,44,61,67,74`；`OwnershipGuard.java:44`；`VersionHttpIntegrationTest.java:141` | 全部新读取先所有权后存储，匿名由AuthFilter拒绝；五类HTTP路径的公开/远端验收为匿名401、另一owner ADMIN404，响应不含源码/摘要/报告。无管理员绕过。独立本地T4因ready ID为空未完成，400不构成权限测试成功。 |

其他核验：

- 全部30个变更文件范围符合A任务：services/api、contracts/versions、tests/versions及D11-A交接；无锁/CI/迁移/runner/前端修改，无整仓重构。生产agent接入属于A允许范围。
- SQL只拼接固定allowlist状态分支，参数绑定；source路径、设备名、大小、case alias、链接/junction/Unix hardlink检查；JSON文本/no-store/nosniff；报告白名单投影，不暴露host路径、原始日志或平台秘密。新增文件中的密码为明确测试替身，无发现真实秘密。
- DRAFT/VERIFIED/FAILED及latestReady分离；未知工具退出码null保留。NON_NULL只省略可选record字段，report JsonNode保留显式null，实际报告符合闭合Schema。
- `node --test tests/versions/contracts.test.mjs` 独立3/3、exit0，日志 `contracts.log/.exit`。首次沙箱运行无法读pnpm依赖链接，随后用获准工具执行同一命令通过；不是修改或减弱断言。
- 既有测试变更仅增加平台源码一致性断言和测试目录清理；OwnedWorkspaceCleanup仍校验自有边界并抛清理错误，未增加skip/retry、延长超时或关闭隔离。原四门禁入口未改。
- 已直接读取精确候选最终CI run https://github.com/Echo-love928/CodeLess/actions/runs/38138697165 。verify:static / verify:api / verify:runner / verify:e2e / infra-preflight / ci-gate全部completed/success；原始日志确认API173、failure/error/skip均0，版本HTTP5及存储7实际执行，E2E33 passed。此远端结果与本地失败分别记录。
- PR当前base仍是当前main，GitHub reviewThreads总数0、无分页遗漏，既有reviews为空。审查账号Echo-love928与作者yuanqizuimeng不同。PR保持draft，本次未批准或合并。
- 原工作区仍main@413e5b8，仅原有未跟踪 `.idea/`；审查工作树HEAD4f364a3、跟踪文件无改动。没有运行真实模型外呼，模型质量没有新增结论。

后续仅复核作者/维护者新增修复、变更及受影响范围；本地验收阻塞解释或消除、最终启用PR真实联调与公共契约同步、最新base/HEAD必需检查success且无未解决讨论后，按仓库规则决定批准。无需为token平衡制造修改。
