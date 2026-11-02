# D28-A 候选版本服务端独立验收

## 2026-11-02 第二次复审：统一候选与原阻塞闭环（当前）

**结论仍HOLD；本轮没有声称修复历史EPERM/CLEANUP_FAILED，也没有部署或付费模型调用。** B已在PR95将A的a16ac25与B的80205692合为 **`00fd43333f35c5cb0cce425721fdce9cd1d0f956`**。本轮据此准备同源候选，独立worktree为 `.local-data/d28-a/unified-00fd433`，没有修改B文件或main。主分支仍2be。统一候选清单 `tests/release/api/d28-unified-candidate.json` 固定该源码/tree、API/JAR、client、worker及独立镜像；这是验收候选，不是根因修复或发布批准。

本轮实际完成：

- **精确00fd门禁六success**：[run41424603409](https://github.com/Echo-love928/CodeLess/actions/runs/41424603409)，`d28_ci_snapshot.py --head 00fd43333f35c5cb0cce425721fdce9cd1d0f956 --run 41424603409` 退出0；原日志私存，`evidence/d28-fix/ci-00fd433-2026-11-02T10-14-06.654200+00-00/result.json`。不继承a16或旧61成功，后续A交接HEAD自身检查另看PR。
- **同源封存**：API manifest `3d0e52103de6bf1614bc751302566d51e6364459054fdbb4e6030cb8144486a9`，JAR仍 `d2c1bc7...`；client manifest `db83cd46801ab1c587cdb85e022533ec14735a6efe3b5301682cabc4f04f6fbe`；独立镜像 `sha256:e73196cae90d4f114cc1dd0c3e285524c3449a1b193e2befd49f8dcf05ccd445`，revision标签00fd、归档内容与配置摘要已核对。258个API源文件逐字节核对Git blob、JAR五迁移一致，API/client共享113文件全部相同。没有改共享策略tag或推送镜像。
- **迁移/恢复**：新00fd JAR的空库/合成V4 dump→源cluster销毁→新cluster restore→迁移/权限等 **40项原生0**。另找回A机原D23机密备份，原manifest/dump摘要匹配，恢复至全新PG，用新候选JAR验证旧版本/源码/导出及权限 **22项原生0**；原备份字节不变，cleanupErrors=[]。这22项是真实历史生成数据（原模型mock），不是生产Linux绝对路径预览或新真实模型效果证明。原D23备份没有上传。
- **新镜像真实回归**：封存API源码配明确e731镜像ID，真实Docker/Vue/Chromium正常路径通过；歧义目标按原要求ACTION_FAILED、worker exit1，两个build均0，容器/工作区/浏览器清理成功。回执在断言前保存。`evidence/d28-followup/unified-runtime.json` 记录两个场景、命令/原生0/摘要；不声称复现旧CLEANUP_FAILED。
- **工具最小改动**：仅A允许范围内给 `existing_demo.py` 增加显式候选参数、`d28_attest.py` 增加候选/新输出参数；原默认和断言不变，新输出拒绝覆盖。`d28_live_identity.py`增加显式新候选/实际已安装manifest路径比较。8项原控制通过，路径越界/覆盖负对照按预期非零；新产物及原报告保持。

尚未闭环的具体证据与下一步：

1. **EPERM/CLEANUP_FAILED仍OPEN**。46份EPERM原JUnit/场景/journal及676107字节原CI API日志均复算匹配，47文件私有取证包SHA `2dcc9613a2b03c16cb290d330a6819b14f8aa7fb819632682a7db33b9fbf5488`，未上传。原EPERM仅存error.message而未存stack；原CLEANUP_FAILED在断言后才落报告，原同次runner/JUnit/句柄与拒绝栈缺失。当前GET旧run artifacts总数0，不能据此断言其历史上从未存在。`evidence/d28-followup/original-failure-chain.json`逐项列可用与缺失，rootCause=null；无法从新428/428倒推历史占用者。
2. **有界带栈诊断受阻**。准备的 `d28_stack_trace.ps1` 仅启用独有命名的Kernel-File用户provider、stack、128MiB循环文件、7分钟截止；不改注册表或全局kernel logger。本次Windows UAC明确返回“operation canceled by user”，追踪未启动，两个原定向API用例没有执行；父记录器退出1、Maven退出null、JUnit=[]，不重启UAC或补0。脚本只有语法检查，实际stack捕获尚未验证。后续需原保留现场，或在用户再次允许且具备管理员会话时作一次有目标的新失败捕获；未确定机制前不写猜测性产品修复或添加重试。
3. **新候选部署证明仍未通过**。已授权SSH只读将现部署与00fd清单比较，原生 **1**：运行JAR/worker/258源码/7web字节相同，但deployed记录、封存manifest和实际策略镜像仍61，三项失败。`evidence/d28-fix/live-identity-2026-11-02T10-25-19.254660+00-00.json`保留真实不匹配；旧61核验继续保留，不能当00fd已部署。根因/发布阻塞关闭后由部署维护者成组切换，再提供实际manifest路径，运行同一只读新候选比较入口。
4. **真实质量/生产cover仍NOT_RUN**。现有主机模型凭据已配置，本轮不再称缺密钥；用户已明确授权本轮最多 **2元，额度不足即停止**，账号CNY/足额只读核验通过，证明仅私存。但原免凭据TLS前置12次中11次取得预期证书，第12次certs=0/subjectNONE/issuerNONE，原命令退出1；JVM探针和付费批次未到达。`evidence/d28-followup/real-admission.json`及原字节TLS观测保留；没有放宽证书门禁或重复求绿，新模型请求/支出0，本轮2元授权保留。`d28-real-acceptance-plan.json`给出00fd、原14样本/冻结运行时上限/无外层重试和当前官方峰值计价上界；旧fb79财务sidecar固定旧候选，不能借用其批准。需eval维护者绑定新候选并协调独占runner窗口；生产cover另需对应维护者完成新部署后的真实capture账本与已服务截图字节验收，不以本地截图代替。

汇总 `tests/release/api/evidence/d28-followup/summary.json` 关联每份回执及SHA。T1本轮统一候选必需检查通过；T2仍未证明严重缺陷零；T3本轮迁移/恢复与包同源通过，但新部署比较失败；T4已执行部分有原始结果、完整验收仍不成立。M5保持HOLD。开发input/output/total与计量来源UNKNOWN；本轮付费模型请求0、合成累计请求/token UNKNOWN，分账记录。未批准、未合并。

## 2026-11-02 B复审后的当前修复状态

PR94原精确HEAD `438c0f5` 的远端结果已取回：static/API/runner/infra success，**E2E和ci-gate failure**，[run41321844346](https://github.com/Echo-love928/CodeLess/actions/runs/41321844346)。79 passed、1 did not run、2 suite errors，原120秒suite/teardown截止；`evidence/d28-fix/ci-438c0f5-failure.json`及原日志/trace摘要保留。下面原“PENDING”仅是发布时快照，不再作为当前状态。

最小范围扩展仅 `apps/web/playwright.config.ts`：D08原生验收另列首项目，其余79项仍用原Chromium；原80个file/title身份逐项相同、无重复/遗漏，globalTimeout仍120000、retries仍0，原测试断言没有修改。原trace显示D08约第78秒才开始而自身预算115秒。**修复提交 `4eb9595f513696abf95ace3dc4bf5670b0cbeec3` 六项必需检查已全部success**，[run41411371862](https://github.com/Echo-love928/CodeLess/actions/runs/41411371862)：E2E80通过且完整平台browserExit0，API428/428、runner285/285、static64+212、infra和ci-gate通过。GET取证入口 `d28_ci_snapshot.py --head <完整SHA> --run 41411371862` 原生0；原日志摘要、精确head绑定及六项检查见 `evidence/d28-fix/ci-4eb9595-2026-11-02T08-29-39.428736+00-00/result.json`。GitHub不提供的子进程退出仍null。公共契约、锁、CI、迁移与产品运行代码均未变；B仅需注意D08项目名/trace路径变化。后续交接提交自身检查必须另查，不继承4eb的success。

`d28_record.py`改为探测显式 `--java-home`、标准JAVA_HOME_21_X64/JAVA_HOME/PATH并验证Java21；错误major或探测失败拒绝，不再依赖A机器路径。任务私有pnpm shim由当前运行生成。新增4项可移植性负对照与原4项证据接纳测试均通过；假版本探针只证明选择策略，实际完整API仍使用真实Java21/PG/Docker/Chromium。

旧缺件结论已更新：PR95@`80205692`已只读审查，23处Git blob证据引用SHA全部匹配；B原gh获取方式与direct API字节两组证据已核对，不再将其当未解释摘要阻塞。见 `evidence/d28-fix/peer95-review.json`，未冒称A独立执行了gh或重跑B私有浏览器链。PR95自身全门禁失败仍保留、未批准。

用户提供既有SSH密钥目录后，当前部署61已独立**只读**取证9项通过：运行JAR的打开fd摘要、worker及其启动绑定、镜像ID/revision、258源码与7个Web文件、agent/export路径均匹配选定清单。`live-identity-2026-11-02T07-51-38.317154+00-00.json` native0；没有部署新候选、重启或改服务器。首次测量用/proc整秒btime误判约1秒，失败回执保留；改用CLOCK_BOOTTIME的同次采样纠正测量，未改部署字节。当前61身份已证，不再声称缺访问；新候选是否部署仍单列false。

原Windows完整API首次复现遇Docker Desktop未运行，在Testcontainers前置失败，未触发BARE；原记录保留，不算EPERM复现。既有Docker29.9.2恢复后，在原Windows干净438提交执行原 `corepack pnpm verify:api` **原生0，428/428、failure0/error0/skip0**，90份本次JUnit及日志摘要逐项复算无差异，sourceBytesUnchanged/headUnchanged均true。用户授权的本卡独有128MiB管理员文件元数据追踪覆盖BARE现场。最终命令回执为 `evidence/d28-fix/2026-11-02T07-54-42.103368+00-00-windows-api/command.json`。

管理员追踪start/stop均0，128MiB ETL仅私存；筛选1049017个事件，保留511个目标事件。`evidence/d28-fix/windows-file-trace.json`记录同一产物目录一次底层rename的0xc0000022随后不到1ms另一次rename成功；本次BARE两次build均0、按原断言得到NO_PROGRESS，**没有复现Node层EPERM**。同时出现的进程访问不能证明历史占用者；ShareAccess7允许DELETE，不能据此归因杀软。循环记录可能覆盖早期事件，无拒绝堆栈，原历史actor/mechanism仍UNKNOWN。复现及解码均不改生产动作/重试；不增加无计划第三轮全量重跑。

| 当前判据 | 结论 |
| --- | --- |
| T1 | 本次4eb远端六项success、原Windows438完整API428/428原生0均已独立取证，无skip/neutral代替；原2be失败保留并作为T2历史事故继续阻塞，不能据新绿宣称根因关闭 |
| T2 | **未通过**；原EPERM、ENOTEMPTY、CLEANUP_FAILED及真实模型质量/生产cover仍OPEN/HOLD，不能宣称严重缺陷零 |
| T3 | 现部署61的API/worker/镜像/源码已独立证明；新候选未部署，不能宣称新候选的部署验收通过 |
| T4 | 已完成结论均有提交/命令/退出或GitHub状态/结果/SHA；PR95与原日志获取方法已更新，未执行与未知仍明确保留 |
| M5 / 合并 | **HOLD**；无另一人批准，未合并。最终HEAD检查见PR；历史严重阻塞关闭前不得放行 |

后续最小交接：API/runner维护者需对历史产物rename/终态淘汰/cleanup失败取得同一次失败的句柄生命周期和拒绝栈，形成最小修复及新候选；本次成功现场只能帮助缩小观测范围，不能替代历史事故闭环。真实模型及生产cover验收另需对应维护者提供授权范围和原始结果，不开展未授权付费调用或生产写入。

## 以下为初始交付与原失败快照（保留，不覆盖当前增量）

结论：**HOLD；不得据本记录合并或宣布 M5 通过。** 四阶段实际终态、专项、已知缺陷、部署身份与同伴材料是独立条件，不以其中一项成功覆盖另一项。最终逐项汇总见 `tests/release/api/evidence/d28/summary.json`；原始失败及每次命令回执分别保留。

本次完整API已原生 **1，427/428、failure1/error0/skip0**：`RoundFiveRegressionTest.controlBareDoneWithoutChangingSourceStillStopsAsNoProgress`（测试129–133行）预期 `AGENT_REPAIR_NO_PROGRESS`，实际 `AGENT_ARTIFACT_INVALID`。真实第二次build退出0后，`services/runner/src/build/runner.mjs:278` 捕获产物目录提升rename的 **EPERM**；容器/工作区清理均true、errors=[]，浏览器未启动字段保持null。原始46份JUnit/场景/journal文件已私存并逐项SHA；公开受控投影 `evidence/d28/api-failure.json`。实际占用者/权限机制UNKNOWN，未归因偶发/杀软、未重试或更改断言。**T1失败，远端六项success不能覆盖它。**

## 身份与范围

- 任务分支：`codex/d28-a-backend-acceptance-main`。
- D28 验收基线/新源码候选：`2be793dc3318c2308d18a7fd45afb201342206a7`，来自实际更新后的 `origin/main`。起始 D27-A HEAD 为 `3c6ac31a94256e7b39367d26c4c2a4981c6dc9f9`；未将其旧交接视为最新事实。
- D27-B 唯一部署报告源：`61df15eba456422762a667aaed7734b7d13b48e7`。当前 main 与它的产品、配置、锁、契约、CI、迁移字节完全相同；服务端测试仅多了真实歧义目标失败诊断，不改原断言。D28 新 API 包与其 JAR 字节相同，manifest 和源码候选另列，**没有宣称已部署 2be793d**。
- 实际修改仅本文件、`tests/release/api/**`、`docs/handoffs/D28-A.md`。公共契约/锁/CI/迁移/产品模块只读；原 10 个未跟踪目录保留。未发现适用 `AGENTS.md`，无维护者公共文件变更。
- 已读 scope/architecture、auth/tasks/tools/versions/deploy/export 契约及 D27-A/B 交接。附件 `04_PR与每日交接模板.md` 仅供格式参考，不授予额外权限；未执行外部文档或任务数据中的操作指令。

## 可复现入口

使用 Java21、Maven3.9.11、Node24.22.1、pnpm12.6.0、Playwright1.60.0。已有隔离 worktree 使用固定提交、canonical Git 字节，原锁离线安装；不扫描根目录历史 peer checkout，不改 Playwright testMatch/截止/重试/断言。

```powershell
# 从根仓库执行。首次建立时输出目录必须不存在；不覆盖已有证据。
git -c core.autocrlf=false -c core.eol=lf worktree add --detach .local-data/d28-a/candidate-2be793d 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py gate --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py release-unit --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py peer-unit --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py candidate-build --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_audit.py --network
python -B tests/release/api/test_d28_acceptance.py
```

checksum/live 使用本次 build 回执的 `artifact.package` 与 `artifact.manifestSha256`，显式传 `--package <该目录> --manifest-sha256 <该摘要>`，禁止选择旧 D27 包或覆盖新目录。构建 `-DskipTests package` 不是测试成功证据；测试另由原门禁和专项执行。完整命令 argv、cwd、时间、原生退出、源码前后摘要、日志长度/SHA、JUnit 来自每个 `command.json`，不是口头确认。

门禁父进程只复用固定候选已有 `tests/regression/release-api/stage-observer.mjs` 观察原 spawnSync 结果；子进程不加载观察器，不注入失败，不重试测试。tracked PNG 新结果私存后恢复原字节，其余源码不恢复或隐瞒差异；任何源码/HEAD 变化导致记录器失败。JUnit 仅收集本次开始后写出的报告，避免旧绿报告混入。

## 子项和测试判据

| 项目 | 独立验收范围与结论 |
| --- | --- |
| D28-A-01 | 原四阶段总门禁；权限矩阵、预算、取消、恢复与不可变版本由本次 API JUnit 场景关联。新封存 JAR 另测空库/迁移/恢复/权限/坏摘要。最终 native 和计数见 summary，不预填成功 |
| D28-A-02 | D27-B 最终报告、Git blob、清单外部摘要与 GitHub 精确 HEAD 已独立复核；D28-B 材料未发现，完整同日互审阻塞。详细三类结论见同目录 `peer-review.md` |
| D28-A-03 | 本次命令与候选、退出、结果、原日志/报告摘要关联，Git blob 原字节核验；未知仍为 null/BLOCKED |
| D28-A-04 | 新main形成新API候选后完整实测失败；当前2be继续HOLD，无已证修复候选。已封存EPERM现场并交API/runner维护者，需要原现场占用/权限追踪、最小修复后新身份与受影响重测；本卡不跨模块试改、不重跑求绿。历史268/2d/6d/51及旧失败保留。公开URLError和沙盒EPERM仅按已证环境原因重查受影响范围 |
| T1 | **FAILED**，当前完整API native1。Windows本地四阶段与远端Linux/infra分账；旧61或当前2be远端success不覆盖本机427/428，更不继承给最终交接提交 |
| T2 | **未通过**：既有严重发布/质量阻塞未归零，原 ENOTEMPTY 与 CLEANUP_FAILED 原因 UNKNOWN。新测试成功也不关闭历史事故；详见 D27-B 当前 unresolved 和 `docs/release-blockers.md` |
| T3 | 源码/封存 API/清单可独立验证，B 部署记录同源关系已复核；当前受保护 API/worker/容器/镜像身份未由本机再次核验，2be 新候选未部署。完整“版本/部署/源码哈希一致”仍 BLOCKED |
| T4 | 已执行部分全部由真实回执、JUnit、Git blob 和只读 GitHub 原始日志/元数据支持，无口头成功。B私有包/D28-B未到位；61的static/E2E原日志摘要匹配，API/runner与B声明摘要不同、原因UNKNOWN，保持BLOCKED，不归一化放行 |

## 版本与部署边界

D27-B 的 API/client manifest Git blob SHA 分别为 `e488c594cd32ac3bcf7b76faffba7810bc400a7f9c8bd8daa19340ae76a7246c` / `676635224f6e6dc28e0d8794daf34c87da6e3773b265cc0ee93485e38dee943b`。258 源文件逐一匹配 `gitBlob`、SHA256 和当前候选原字节；两个清单与包外 selected 摘要严格相同，无换行归一化。worker Git 源摘要 `311ed218b65e7a6bf5ceb309b8c7ff6c9f8f8fc73a6671faa3d5c50ae475cbaa` 匹配报告；这属于**报告与源码一致性**，不是当前服务器实物复核。

本次新 API 源码 `2be793d`、manifest `54d2cc55eb579073ca9570620a56ebe45598166ac7e01fd45121399a0377f453`、JAR `d2c1bc7bccd9df9eec194fde509fa012f5c41eb3a7703aad669aaa447e067446`。259 项文件，独立 Git 构建/未借用旧 target。B 的成组包/镜像包只在其主机，A 未收到并未谎称重算其归档字节；本卡不部署、不操作生产 SSH、旧数据库或发布入口。

模型明确 deterministic-mock（预算测试还有明确标记的 loopback provider fixture）；生成后的 PG、Docker/Vue 构建、Chromium 使用真实执行。新付费模型请求 0，合成调用/token 累计 UNKNOWN。真实模型质量、生产 cover 与历史失败不因此解除 HOLD。

任务恢复的 `ProcessRestartRecoveryTest` 真实启动/强杀/重启API进程与PostgreSQL，stage/hosting适配器是明确recording fixture，只证明恢复语义，不单独证明模型/公开托管质量。构建、浏览器和发布读取由其他实际用例分别覆盖；summary保留这些用例名称与原XML摘要。

最终原四阶段：**static0 / API1（427/428、error0/skip0） / runner0（285/285） / E2E0（80/80+完整平台browserExit0） / ci-gate1**。四阶段原命令均实际执行，无重试。90份本次JUnit及日志摘要全部复算一致，源码/HEAD前后相同；summary退出1/HOLD，provenanceMismatches=[]。精确2be远端六success独立记录，不覆盖本机失败。

交付为 [草稿PR94](https://github.com/Echo-love928/CodeLess/pull/94)，新PR当前HEAD检查另行运行，未等待/未继承旧结果。summary的 `NOT_RUN_LOCAL_DRAFT` 是其生成时的发布前快照；当前发布状态看 `publication.json`。整体仍HOLD，未批准/合并。

## 失败、新候选及合并条件

代码、base 或候选集合变化后必须新身份与受影响重测，不手改 report.success、不用历史成功替换失败。若有产品修复，交对应维护者最小 PR；本卡不跨模块修权限、runner、CI 或预算。所有结果、严重问题、当前精确 SHA 的六项远端检查、最新 main、未解决讨论及另一位成员批准同时满足后才可考虑合并。当前未批准、未合并。

开发 agent input/output/total：UNKNOWN/UNKNOWN/UNKNOWN，计量来源 UNKNOWN；未把 60,000 预算或上下文容量写成实耗，无法声称实测 70%。本次运行时用量另列，不合入开发 token。
