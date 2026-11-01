# D28-A 候选版本服务端独立验收

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

## 失败、新候选及合并条件

代码、base 或候选集合变化后必须新身份与受影响重测，不手改 report.success、不用历史成功替换失败。若有产品修复，交对应维护者最小 PR；本卡不跨模块修权限、runner、CI 或预算。所有结果、严重问题、当前精确 SHA 的六项远端检查、最新 main、未解决讨论及另一位成员批准同时满足后才可考虑合并。当前未批准、未合并。

开发 agent input/output/total：UNKNOWN/UNKNOWN/UNKNOWN，计量来源 UNKNOWN；未把 60,000 预算或上下文容量写成实耗，无法声称实测 70%。本次运行时用量另列，不合入开发 token。
