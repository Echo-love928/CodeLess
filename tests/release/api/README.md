# D27-A 验证入口

当前唯一交付源为1f072dc（完整SHA见candidate.json）：unit16、live40、existing-demo22、runtime-imports4均通过；旧268包已撤回，以下早先15/38计数和固定旧evidence文件是历史。当前归档/独立核验/配置清单位于 `evidence/artifacts/<完整sourceCommit>/`，精确路径从candidate.json取，不能选旧成功替代新候选结果。

复核交付包用checksum/runtime_imports/check_candidate；重新构建该源用 `scripts/release/api_release.py build --revision <candidate.sourceCommit> --output <全新目录>/api --log <包外日志>`。record.py build选择当前HEAD，最终文档HEAD不等于已封存源；新构建日志/环境元数据可不同，不能覆盖已选manifest/归档。传输按外部可信摘要验证已有包。

原四门禁native1保留：runner284/285 ENOTEMPTY；E2E重复Playwright修复后又误发现旧peer共155项而超时。`clean_e2e.py` 在自有 `.local-data/d27-a/e2e-1f072dc` 固定提交干净worktree执行原锁offline install和原verify:e2e，80/80及完整平台原生0；不改变testMatch/timeout/断言、不移动旧资料。不要在Root继续重复扫描旧peer，也不要用这个通过关闭runner/ci-gate失败。

最新live等待两条真实fixture账号/凭据后才停止初始化源，并以pg_isready TCP确认最终服务；CSRF200或临时Unix socket接受连接不足以证明fixture已完成。旧admin缺失和psql native2均保留，后者原stderr没保存而不强行归因。后续失败stderr只落私有目录，正负断言不删除。

先固定独立任务分支和完整候选提交；所有命令在仓库根执行。使用已锁Java21（显式设置JAVA_HOME，操作员环境可能仍指向旧/不存在的JDK）、Maven3.9.11、Node24.22.1、pnpm12.6.0；Docker需要可达本机daemon。没有付费模型调用。

```powershell
# 本机现有工具位置；其它主机设置各自已经核验的Java21
$env:JAVA_HOME = Join-Path (Get-Location) '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1'
python -B tests/release/api/record.py unit
python -B tests/release/api/record.py build
# build回执的artifact字段用于登记candidate.json；一个候选只选一套产物
python -B tests/release/api/record.py checksum
python -B tests/release/api/record.py live
python -B tests/release/api/record.py gate
python -B tests/release/api/archive.py
python -B tests/release/api/check_candidate.py
```

`build` 只从HEAD白名单Git blob独立package，**不运行测试**。256项内容以实际manifest为准；构建输出/日志保存在 `.private/runs/<id>/`，不会提交JAR/备份/凭据。将 `buildReceipt` 的artifact字段原样写入 `candidate.json` 后才执行checksum/live；不要挑历史成功覆盖最新失败。同一输出目录拒绝重建。生产安装入口/迁移恢复和配置清单见 `infra/release/api/README.md`。

- unit / T3、T4：完整性正例、文件篡改/缺失/新增、manifest和SHA256SUMS篡改、可信摘要缺失、路径/秘密文件/硬链接、错误CLI原生非零、拒绝覆盖已存在包；版本锁/默认开关/既有契约路由/能力限制说明核对。此测试的伪JAR仅是完整性fixture，不能证明T1启动。
- checksum / T3：对真实候选包全量复算，拒绝与外部可信manifest摘要不符；公开回执只含摘要和提交。
- live / T1、T2边界：同一封存JAR生产主类；真实PG17.6空库FlywayV1–V5；独立V4合成历史fixture备份/源库销毁/新cluster恢复/V5迁移；旧版本/源码/发布、未知和歧义来源null、权限/坏源码/坏Flyway checksum、再次启动。历史VERIFIED/build/publication仅是显式数据兼容性fixture，不能充作真实构建/浏览器证据。
- gate：原 `scripts/ci-gate.mjs`，串行原四 `pnpm verify:*`。复用已有D26父进程被动退出码记录器，不改变spawn参数/返回值；不注入失败、不重试、不改CI。完整日志、JUnit/SQL/会话私存；命令、各阶段native、日志摘要/计数公开。被门禁改写的既有截图先保留新副本，再恢复原字节。若源码/HEAD变化，回执明确FAILED，不推算success。

## 已有真实生成演示库的升级兼容

本机还保留D23规范批次的机密备份。只有它与已提交的D23成功报告manifest/dump摘要完全相同时才使用：

```powershell
python -B tests/release/api/existing_demo.py --backup tests/backup/.private/application/2026-10-28T15-24-06.249Z-41390e6a-dccb-4f7c-9d72-a9752628549a/backup --source-evidence tests/backup/evidence/2026-10-28T15-24-05.683508+00-00-application/application-summary.json
```

这是**已存在、真实生成/构建/浏览器验证过**的演示数据（原模型明确mock），不是重新手填成功行。新脚本只读原备份，以D23未改动恢复工具还原至独立新PG/新staging，用同一D27生产JAR在任务/发布/sweep/cover关闭时执行Flyway验证并启动。核对原owner凭据登录、同version/build/source/artifact/latestReady/publication、全部源码HTTP内容摘要、与D23逐字节相同源码ZIP、原五表引用未变、原备份所有字节未变和匿名401。

D23库已经是V5，本次是已有V5升级兼容和真实validate；V4→V5实际前迁由live独立覆盖，不虚构新增迁移。新staging根只支持本次版本/源码/导出读，不宣称原绝对journal路径预览、Linux/systemd停写、生产数据库/异机ACL或新公网发布已验收。原备份缺失的其它主机应从受保护渠道取得**同摘要**副本，不提交或公开整份备份；没有副本则本项阻塞，公开结果无法单独重跑机密输入。

`evidence/*-existing-demo/result.json` 保存原生退出、输入摘要/原版本绑定/新候选摘要与逐项结果；原始JVM日志/数据库/ZIP仍在 `.private`。失败尝试不会删除；第一次操作员JAVA_HOME=F:\jdk17且文件不存在，原退出1、尚未启动候选JVM；后续显式使用Java21，不能把首轮改为通过。

第二次在候选JVM启动后暴露验证器局部 `import urllib.parse` 使外层urllib成为未赋值闭包变量的NameError；修正为模块级导入，补Java21前置核验和私有异常栈后，第三次完整通过。它是本卡验证器错误，不归因于产品，也不删除前两次失败。

`archive.py` 将已经校验的候选包生成固定mtime/uid/gid、原Git执行位的 `api/` tar.gz，拒绝覆盖；生成后重新比较每个成员字节与封存目录。`check_candidate.py` 另行校验255份Git blob身份、JAR中V1–V5迁移原字节、压缩包SHA256/成员，输出源码引用的配置名称/镜像声明清单；不读取实际环境值。公开摘要在 `evidence/artifact-collection.json`、`candidate-attestation.json` 和 `configuration-inventory.json`。传输包位于 `.private/`，本地交付而非上传公开仓库。
