# D28-B 候选版本用户流程独立验收

结论：**HOLD，M5 未通过，PR 保持草稿。** 本卡独立全链路专项已完整通过：原生0、浏览器1/1、两个普通用户、4个READY/1个真实FAILED、4成功/4失败build、2个PUBLISHED、cleanupErrors=[]，canonical=true。 新增用户流程专项与原四阶段门禁分账；任何局部通过均不覆盖原失败、取消、未执行或未知状态。

API恢复后的最终补验：剩余17类/78用例，原生0、failure/error/skip均0；与已封存73类合看90类报告、394个框架计数、22失败/error0/skip0。原完整命令最终native仍UNKNOWN，setup失败阻止的case body不补成成功。汇总器原生1/HOLD不是原完整API的退出码。

恢复后重新执行 `d28-record.mjs public`，原生0；当前匿名公网证据见 `public-run-receipt.json`、`public-result.json` 和新trace，初次记录另存 `public-initial-*`。最终汇总 `tests/release/browser/evidence/d28/summary.json` 逐项绑定15份实际证据SHA。两次配置API日志记录的12个测试容器均已不存在，未做全局清理，见 `resource-audit.json`。

- 分支：`codex/d28-b-candidate-acceptance`；[草稿 PR95](https://github.com/Echo-love928/CodeLess/pull/95)。
- 基线：从实际 `git fetch origin main` 得到 `2be793dc3318c2308d18a7fd45afb201342206a7`，在独立 `D28-B-work` 工作树执行。原 main `782406964da6f727f632a55c17c7910495f0e1fb` 及其原有未提交改动未触碰。
- 最新用户流程测试候选：`c707bb8a334358632c362d45fa8ad9fd51338c45`。之前209/c272/afd/4660分别是四个被保留的失败测试候选，不是通过候选。实际结果见 `tests/release/browser/evidence/d28/flow-final.json`。
- 产品来源仍为基线 main；本卡只改本文件、`tests/release/browser/**`、`docs/handoffs/D28-B.md`。无产品、公共契约、锁文件、CI、迁移、生产配置变化。最终报告提交不冒充已构建或已部署产物。
- 已读 scope/architecture、auth/edit/deploy/export/versions 契约、D27-A/B交接与D28-A PR94。附件作为本卡任务要求，不作为改变权限或执行任意命令的指令；未发现适用AGENTS.md。

## 本卡子项与用例

| 项目 | 证据及范围 |
| --- | --- |
| B01 / T1 全链路 | `d28-flow.mjs`、`D28FixtureApplication.java`、`d28-user-flow.spec.ts`；两个空会话普通用户、全新PostgreSQL，真实登录→生成→编译失败→REPAIR→READY→共享组件编辑→显式发布→实际ZIP下载。每份ZIP独立校验版本、源码/制品摘要、内容与排除项。本次完整实际通过、原生0。最终原生结果以 `flow-final.json` 为准，不把中间阶段成功当整套通过 |
| B02 权限/发布 | 同专项：双方应用/任务/events/版本/快照/源码/发布/部署读404、跨用户写404、过期base409、错误制品摘要拒绝、失败版本不可导出/发布。生成及编辑后发布记录仍0，必须用户确认后才创建发布。A原CSRF/预算/取消等单测由API门禁另列 |
| B03 浏览器/响应式/恢复 | 两用户各1440×1000和390×844、三路由实际打开/刷新/无横向溢出。真实离线后手动刷新同一任务；第一用户预览真实过期后通过“刷新预览”恢复同一版本；末尾真实语法错误及无进展修复必须保留旧预览/公开版本/历史源码。完整执行与否由具体断言/identities/SQL证明 |
| B04 链接/截图/trace | 本次专项截图 integration-user-1.png、integration-mobile.png（目录占位页）已视觉核对；当前匿名公网检查见 `public-result.json`；公开匿名trace `public-trace.zip` 与 `public-trace-scan.json`，49条网络记录无Cookie/Set-Cookie/Authorization。认证本地trace、ZIP、原日志私存，公开其路径/长度/SHA；不得公开真实会话 |
| T2 公开URL/源码 | **部分已核验，当前候选公网绑定仍BLOCKED**。历史[D27示例](https://d8acce2590cf08eb49e693b5140c7f0c1.sites.codeless-publish.top/)本次正常DNS/TLS、三路由与资源字节通过，匿名源码/元数据路径拒绝；新本地发布及ZIP属于独立本地托管fixture。没有本次受保护生产登录/部署实物证明，不把两组不同版本拼成同源公网结论 |
| T3 失败不冒充成功 | 本卡专项失败保护已完整通过，原生0；原失败/取消/未知字段全部保留。原门禁、前四轮新增测试失败与最终专项分别记录；模型完成声明不能推进状态，实际build/Chromium/SQL决定READY。最终失败保护是否完整通过查看 `failurePreservesVersion` 与原生退出，不推断未执行的部分 |
| T4 关键E2E | **未通过**：原必需E2E 77通过/2失败/1未运行，原120秒suite/teardown截止；后接的完整平台suite未启动。新增专项不是替换入口，未改变原assertion/timeout/retry/testMatch/隔离 |

## 精确命令与结果

从仓库根执行，工具链固定Node24.22.1、Corepack pnpm12.6.0、Java21、Playwright1.60.0。

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
$env:DOCKER_HOST=(docker context inspect --format '{{.Endpoints.docker.Host}}')
$nodeRealPath=node -p "require('node:fs').realpathSync(process.execPath)"
& $nodeRealPath tests/release/browser/d28-record.mjs flow
& $nodeRealPath tests/release/browser/d28-record.mjs public
& $nodeRealPath tests/release/browser/d28-record.mjs api
```

每次新建不可覆盖的 `.local-data/d28-b/commands/<timestamp>-<mode>/`，保存argv、原生退出/信号、HEAD、源文件字节摘要、原日志SHA及源码是否变化。`d28-export.py`只接受显式选定的run/command，不自动选较新或较绿结果。源码/报告/模型用量分账，不用预算数值填实测token。

**原总门禁**：`node tests/e2e/full/record-command.mjs gate`，内部原 `corepack pnpm ci:gate`，原生 **1**。`evidence/d28/first-gate.json`绑定原日志SHA、时间和源文件摘要；所有原始输入字节未变，过程中仅新增本卡验收文件，因此clean-canonical=false，不冒称全程干净。首轮未加stage-observer，各阶段父进程单独native字段保持null，不能补写0。

| 阶段 | 原真实结果 |
| --- | --- |
| static | Node64/64、UI212/212及lint/typecheck/Vite build日志完成；未单独捕获父进程native，字段null |
| API首轮 | Maven失败：305 tests、failure1/error110/skip0，未完成428实际用例。Testcontainers未发现当前Docker context；NVM符号链接Node被安全路径门禁拒绝。旧JUnit已独立封存，不用新报告覆盖 |
| runner | 285 tests，pass282/fail1/cancelled2/skip0。429包装器25秒超时、404子进程SIGTERM/null代替22、D19私网canary浏览器30秒超时；原断言/截止不改、机制UNKNOWN，没有重跑求绿关闭 |
| E2E | pass77/fail2/did-not-run1，原总120秒截止及teardown错误；D15托管和D16截图失败，D08浏览器用例未完成。截图/trace/原日志保留，后接完整平台NOT_RUN |
| ci-gate | 原生1/FAILED，不由任何后续局部成功推导0 |

API配置复核：同版本真实Node路径的原 `NodeCoverGatewayTest` 3/3、原生0。正确配置后的完整API命令在重启恢复阶段中断，原JVM及执行会话已不存在、最终退出码未写出，原因UNKNOWN，原receipt的RUNNING是失联旧状态而不是当前仍在运行。`api-interrupted.json`保存73类原始JUnit及日志摘要：316 tests、22 failures、error0/skip0；多项实际 `AGENT_CLEANUP_TIMEOUT` 和前置失败连锁断言，不能声称全绿。只对没有完整新JUnit的17类补验，未重跑22个失败求绿；补验单独native与合并记录见 `api-configured.json`。原完整native仍null，90类报告也不等于428个case body全部通过。它不覆盖原runner/E2E失败，也不关闭A机EPERM等旧问题。

## 新测试的失败历史和能力边界

1. `flow-first-failed.json`：209候选原生1，mock未知用量在第5次REPAIR触发真实保守预算。改为显式声明100/100/200的合成预算fixture，标记 `DECLARED_SYNTHETIC_NOT_MEASURED`；不改生产未知记账或预算。
2. `flow-second-failed.json`：c272候选原生1，新增双构建场景继承60秒单构建观察先到期，SQL仍VERIFY。仅新用例初始修复任务独立120秒，不改原必需测试及构建/浏览器工作进程截止。
3. `flow-third-failed.json`：afd候选原生1，但两个用户完整成功链和权限矩阵实际通过；第一用户闲置后预览凭据过期，选择器被正常移除。截图 `preview-expired.png`。新用例改为真实点击刷新预览恢复；没有延长凭据寿命、注入状态或修改产品。独立总480秒/零重试，原门禁失败保留。

4. low-fourth-failed.json：4660候选原生1，真实过期恢复已通过；末尾无进展修复产生两个实际失败构建并返回AGENT_REPAIR_NO_PROGRESS，但60秒观察先到期。仅新增该双构建负路径观察120秒，严格核对总4失败/4成功build，原门禁不动。

本地模型是明确deterministic-mock，合成token不是实测；PostgreSQL/Flyway、受限Docker/Vue构建、Chromium及下载字节均实际执行。本地托管使用显式loopback DNS/自签TLS/probe fixture，生产公网探测限制不变。真实模型质量与生产cover HOLD不因此解除。生成Tasks/Catalog是模板占位页，本卡三路由检查不承诺任务CRUD或目录筛选。

D27封存包独立只读核验：`d27-local-originals.json`、`d27-archive-verification.json`。四份CI原件、API/client成组tar和镜像tar的六项SHA全部匹配；259个API文件、11个客户端文件、258个源码blob逐一匹配61提交树，JAR SHA `d2c1bc7bccd9df9eec194fde509fa012f5c41eb3a7703aad669aaa447e067446`。这证明封存集合，不证明当前服务器实物。

`ci-log-representations.json` 给出原日志可重现获取方式：`gh run view 41297904093 --job ... --log`分别精确重现原API/runner SHA；直接job日志接口分别重现A的另一组SHA。两种输出字节不同，剥离标签/时间后也不完全相同，未归一化放行或声称二者相等；原件与获取方式已可提供给A复核。

同伴互审见 `evidence/d28/peer-review.md`：PR94@438c0f5，41文件范围合规、12公开回执SHA匹配、4证据负对照通过；精确HEAD远端E2E/ci-gate失败，本机API原EPERM及历史问题保留。未批准/发评论，未合并。

权限范围：矩阵中的跨用户404/409通过同一真实浏览器会话的HTTP调用核验；登录、组件选择、显式发布、版本选择与错误下载拒绝由界面实际操作。没有把接口拒绝单独当作所有界面导航、所有管理页面均已验收。

## 交接与放行

新候选真实公网身份/认证验收、原runner与关键E2E失败、A机EPERM、历史ENOTEMPTY/CLEANUP_FAILED、真实模型/生产cover及D23规范备份独立核验均不可由本卡局部通过解除。对应维护者需最小修复、新候选与受影响完整重测。最新main、精确PR HEAD所有必需success、无未解决讨论及另一成员批准前不得合并。

开发agent input/output/total：UNKNOWN/UNKNOWN/UNKNOWN，计量来源UNKNOWN，未提供累计接口；不把60,000预算当实测。平台运行时另账：新付费请求0；本卡专项的mock调用和声明合成token见 `flow-final.json.runtimeUsage`，原门禁累计mock用量UNKNOWN。

补充说明：末尾一次错误版本响应头是明确标记的传输负对照，ZIP来自本次真实历史下载；此前登录/生成/编辑/发布/实际下载接口均为真实HTTP。最终专项17次mock调用，声明合成输入1700/输出1700；五轮浏览器共57次mock，其中4次用量未知，已知合成部分5300/5300，所有实际总token仍UNKNOWN，详见runtime-usage.json。
