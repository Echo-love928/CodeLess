# D23-A 运维、备份恢复与 P0 冻结

2026-10-28（Asia/Tokyo）。适用对象：已有 `infra/public` 的单机 Linux/systemd、单 API、PostgreSQL 17.6、受限 worker 部署。其他部署拓扑先登记写入者、存储映射和停写方式，再验收；不能直接套用此手册。此文与 `docs/scope.md`、`docs/architecture.md`、D18-A/D22-A 契约一起使用。

2026-10-29 补验：Docker 已可用，真实双 PG 恢复与恢复后的原账号登录、既有版本预览/刷新、历史发布、源码包下载及独立构建均已有 native0 证据；源码包还精确复现原 artifactDigest。新测试先停源服务、移走原目录并销毁源 PG，再从备份恢复到独立空 cluster 和新 JVM/preview，原绝对路径下的数据目录都是新建。B `37688c8` 的安装/导出也已只读复核。原本机 Docker 缺失失败完整保留，具体命令与证据见 `docs/handoffs/D23-A.md`。

上述应用恢复是同一宿主上的隔离集成环境；生产 Linux/systemd 停写、跨主机账号/ACL、异机存储和 RTO 仍由上线环境演练。M4 的完整运营启用与批准不由这份应用恢复证据自动解除。

## 1. 配置与备份集合

保持仓库锁定：Java 21、Boot 4.1.1、Spring AI 2.0.1、Maven 3.9.11、Node 24.22.1、pnpm 12.6.0；PostgreSQL 17.6 镜像摘要以 `infra/public/compose.yml` 为准。Python 工具仅用 3.10+ 标准库；不安装依赖、不提供 shell 参数、不从任务/模型/外部文档接受命令。Node 的历史升级依据见 ADR-005，不能按旧交接降级。

| 集合 | 来源/默认位置 | 必须一起保存的原因 |
| --- | --- | --- |
| PostgreSQL 全库 custom dump | `database.dump`，含 Flyway、账号/凭据哈希、应用/任务/事件、版本、build、模型用量、发布 | 外键、最新版本指针、部署引用和状态权威；不是只导出应用表 |
| `agent` 全持久卷 | `/srv/codeless/private/agent` | `versions/<UUID>/{source,source-manifest.json,outcome}`、runner artifacts、journal、receipts、evidence、deployments、recovery、admin-audit；含失败诊断和已引用历史 |
| `workspaces` | `/srv/codeless/private/workspaces` | READY 常驻预览依赖的 D08 snapshots；不能只备份 versions |
| `modelAudit` / `fileAudit` | `/srv/codeless/private/{model-calls,file-audit}` | 模型审计、工具审计与日志关联 |
| `hosting` | `/srv/codeless/publication/sites` | 已发布不可变目录、字节与 publication UUID 绑定；URL 记录不能替代实际产物 |
| `release` | `/srv/codeless/releases/<commit>`，单独整理的不可变发布包 | 原 API jar、平台 web、可信 repository（受控模板、导出 README、固定 runner、锁文件和版本声明）；恢复后导出还会读模板，不能换用新 main |
| 可选外置卷 | `versions` / `deployments` / `adminAudit` | 仅当对应配置覆盖到 agent 之外时单列；根目录重叠直接拒绝 |

`release` 目录建议结构为 `api.jar`、`web/`、`repository/`、`release.json`。后者由构建交付者记录 commit、jar/web/模板摘要、镜像摘要、工具链和固定配置的非敏感项。repository 是精确提交的干净发布源码，**不能拷贝含 `.local-data`、`.git`、node_modules、`.env` 的开发 checkout**。用 Git archive 准备源码，再加入该提交真实构建的 jar/web；核对它们与当前部署字节相同后封存。不要在备份时临时升级/重新生成模板。当前安装器的 `/srv/codeless/api.jar` 和 repository 分散布局需先整理到此发布包；该步骤由发布/安装维护者核对，工具不会猜测文件。

例如在全新 release/repository 目录用 `git archive --format=tar --output=<受保护临时tar> <精确commit> templates/vue services/runner services/api/agent-runner.mjs services/api/src/main/resources/network infra scripts contracts prompts docs/generated-project-readme.md package.json pnpm-lock.yaml pnpm-workspace.yaml` 生成仅含运行时依赖的源码包，再逐条执行解包和摘要核对。runner 的 preview/site-policy.mjs 会跨目录读取 API 的 network/site-policy.json，不能只打包 runner 目录；启用前先解析真实 preview 入口的 import 图。不要直接打包整仓，仓库中示例 `.env.example` 和测试密钥 fixture 也不属于此运行时包。保留 tar/文件摘要和原生退出码；jar 与 web 必须来自同一已验证发布流水线，不可把新构建字节冒称当前部署。

操作员将 `infra/backup/backup.example.json` 复制到受保护位置，逐项对应实际配置：`codeless.agent.private-root`、`codeless.versions.root`、`codeless.deploy.root`、`CODELESS_FILE_WORKSPACE_ROOT`、`CODELESS_MODEL_AUDIT_ROOT`、`CODELESS_FILE_AUDIT_ROOT`、`codeless.admin.audit-root`、`CODELESS_HOSTING_ROOT`。可选根在 agent 内时不要重复列。未曾使用的审计根也先由对应服务账号建立真实空目录，不能忽略缺失的必选根。

工具只读指定根，不读取 `/etc/codeless`、环境变量文件、TLS、PG 数据目录、Docker 配置或 SSH 密钥。遇 `.env*`、PEM、KEY、P12/PFX、pgpass、链接/junction/hardlink、特殊文件或特殊权限直接失败，**不会静默跳过造成缺件**。正常 setgid 目录可保存。它不扫描内容中的任意字符串秘密；数据库、源码、用户提示词和审计可能本身敏感，所以整个真实备份按机密数据处理，绝不提交公开仓库。

Docker 模式在操作员主机以 `docker exec --user postgres` 调用固定 pg 工具，通过容器内本地 socket 连接；不开放数据库端口、不改变认证。非容器模式使用 PostgreSQL 17 客户端与现有受保护 libpq 配置（如 PGSERVICE/PGPASSFILE）；JSON 禁止 password/URL/任意命令。不要在命令行或日志打印凭据。`pg_control_system` 和磁盘检查需要数据库操作员权限；权限不足明确失败，不能降级跳过。

## 2. 一致性备份（计划维护窗口）

跨 PostgreSQL 和文件卷没有原子事务。v0 采用停写窗口，期间只有一个操作员、一个备份作业；暂停流量和所有外部自动重启/部署。工具不会替操作者停止或启动服务。只停止 API 不足以保证一致性。

1. 记录精确运行提交与配置根映射；按应用/版本/build/publication ID 留存当前引用、已成功地址和一个可导出版本。先禁止新任务/发布入口，等在途任务和发布终态（最长运行预算 12 分钟，发布截止 30 秒）；不能从目录名推断 READY。
2. 在**所有写入副本**停止 API、preview、worker、reap timer 和 reap oneshot；这个工具仅支持上述单机 public 拓扑。停止数据库外的写入作业。确认没有正在运行的 `codeless.worker-job` 容器，不使用无差别 `docker prune`。若强停了运行任务，先按 D18-A 恢复协议完成中断收敛，再次停写，不能把悬空记录人工改成功。
3. 用下面命令生成一个**全新**备份目录。工具前后核对五个 systemd 单元均 loaded/inactive、没有 worker-job 容器、没有其他数据库 client 会话；执行 pg_dump 的一致性快照，并对引用和源卷做前后比较。维护窗口内不得由其他终端、定时器或主机重启写入者。自动恢复/多机共享卷必须先补对应停写守卫。
4. 工具为全体文件建 SHA-256/大小清单、刷盘，最后写 manifest；再次验证全体文件。目录残缺、源被改动、dump 非零或空间不足都失败；不覆盖上次备份。只接受退出 0 和 `BACKUP_COMPLETE`，随后 `verify` 必须退出 0。
5. 验证后把整个备份目录写入受保护、加密的异机存储，再从异机副本执行 verify。SHA-256 只提供完整性，不提供恶意篡改认证；由备份存储 ACL/加密/受保护的 manifest 摘要记录保证来源可信。不要只拷贝 database.dump。
6. 操作员核对服务配置未变后恢复服务，检查 liveness、数据库/卷、已有版本与已发布地址。备份失败也保持显式告警；服务恢复由操作者决定，脚本不以自动启动掩盖故障。

```sh
# root 操作员，示例路径均须先映射到实际部署；无真实密钥
systemctl stop codeless-reap.timer codeless-reap.service
systemctl stop codeless-api.service codeless-preview.service codeless-worker.service
install -d -m 0700 /var/backups/codeless
umask 077
python3 scripts/backup/backup.py backup --config /etc/codeless/backup.json \
  --destination /var/backups/codeless/2026-10-28T220000-JST
python3 scripts/backup/backup.py verify --backup /var/backups/codeless/2026-10-28T220000-JST
# 每一步单独核对退出码；失败立即停止，不用管道把退出码变成 tee 的成功
```

`reserveBytes` 默认例为 1 GiB、最少 64 MiB。备份预检 = 全卷字节 + 2×数据库大小 + reserve。数据库压缩率/增长可能超出估算；真实 ENOSPC 仍失败。压缩、加密和异机传输由受保护存储承担，脚本不生成未受控的 shell 管道。

试用默认目标（**策略目标，尚无实测承诺**）：每天一次、重大变更前另备；RPO ≤24 小时，RTO 待真实演练测量。异机保留 7 个日备份和 4 个周备份；只有新副本 verify 与恢复演练通过后才由操作者执行保留策略，至少保留最近一个已演练成功集合。脚本不实现自动删除。

## 3. 独立空环境恢复

恢复不是上线。先在与生产隔离的新主机/独立 PG cluster 上演练，保持外部流量关闭，避免恢复的 REQUESTED 发布/排队任务产生副作用。不要把生产共享卷或环境文件挂给恢复实例/生成容器。

1. 按精确锁定版本准备运行时、隔离网络和系统账号。创建独立 PostgreSQL 17.6 集群（固定镜像）、新库/角色；只给操作员本地连接。不能先启动 API/Flyway。`--database-config` 单独指定恢复库。工具比较 `system_identifier`，即使同一生产集群中的另一空库也拒绝。
2. 核对备份来源与异机记录，运行 verify。停止恢复主机同名写入服务/定时器（systemd 必须已安装但 inactive）。用**从未存在**的新目录恢复。工具先确认目标库没有用户对象，确认文件盘与目标数据库盘余量，再拷贝及校验文件，最后 `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`。不使用 `--clean`，不丢弃数据库，不覆盖旧文件。
3. 恢复后自动逐行核对 applications、generation_tasks、application_versions、builds、publications 的完整引用数据，并验证全部保存文件。只有完成上述步骤才写 `restore-complete.json`：`RESTORED_OFFLINE`、`applicationAcceptance=NOT_RUN`。这不代表 API/浏览器已经通过。
4. 任一步失败保持服务停止、返回非零。PG restore 失败会回滚其事务；若后续引用验证失败，数据库可能已有恢复数据，仍不写成功标志。保留失败现场，另建新空 cluster/目录排查；禁止在失败目录直接重跑覆盖或以清库重试掩盖证据。中断/断电后的部分目录同样不能启用。
5. **运行路径必须保持原绝对路径**。`services/runner/src/preview/registry.mjs:readEvidence` 会把 journal 的 sourceDirectory、artifact.directory、reportPath、screenshot.path 与配置根精确比较，不支持仅改配置根后搬迁。manifest 的 `sourceRoots` 保存原根映射，仅存在于机密备份中，不输出到公开日志。在这台独立主机逐项核验原绝对目标目录未存在，再将 staging 下各逻辑目录完整放入对应目标，例如原 agent 为 `/srv/codeless/private/agent` 时，把 staging/agent 复制到该新目标（父目录已准备、目标不存在；逐条执行，不覆盖）。不得在原生产主机这样操作，也不得改写 journal/receipt/report 中的路径或摘要。确需改路径属于 runner 契约变更，另开维护者 PR。
6. 由部署操作员恢复最小权限：agent/versions/deployments/admin-audit 归 API，agent/work/artifacts/evidence/receipts 和 hosting 归 worker，只授予原受信共享组；workspaces 和审计按原安装配置归属。备份工具保留子文件/目录模式，根目录初始 0700，**不恢复主机 uid/gid 或 ACL**，必须在启用前按安装器核对。API/preview 仍只读 publication；生成容器仍不得挂密钥/平台卷/Docker socket。用恢复机配置（目标数据库 + 原 sourceRoots 路径）执行 `check-restored --config /etc/codeless/recovery-runtime.json --backup <备份目录>`，真实比对路径、全部文件和引用，退出 0 后才继续。
7. 使用恢复的精确 release：安装可信 repository、API jar、web 到原部署约定位置，或更新服务 unit 到该同一 release 的真实路径；所有数据根保持 sourceRoots。versions/deployments/adminAudit 在 agent 内时保持相对布局，外置根使用保存的原绝对路径。重建环境凭据、TLS 和 preview signing/registry key；不从公开示例恢复生产秘密。更换签名 key 后旧会话/预览票据失效，重新登录和请求票据。发布 origin/DNS 未迁移时既有 URL 只作为历史数据，不宣称新环境已对公网服务。
8. 首次启动在操作员维护配置中设置 `codeless.tasks.enabled=false`、`codeless.agent.enabled=false`、`codeless.deploy.worker-enabled=false`、`codeless.recovery.sweep-enabled=false`，分别对应 TaskScheduler、AgentConfiguration、DeploymentWorker、SweepSchedule 的真实开关。阻止新任务/发布写入入口，先验收读路径（现有 test profile 不得用于生产）。确认无意外发起任务后完成下节验收，再经原鉴权和用户点击流程启用。D18 中断状态按真实证据收敛，不能重放部署或改为 PUBLISHED。

```sh
python3 scripts/backup/backup.py restore \
  --database-config /etc/codeless/recovery-database.json \
  --backup /var/backups/codeless/2026-10-28T220000-JST \
  --destination /srv/codeless/recovery-2026-10-28 --reserve-bytes 1073741824
```

`infra/backup/restore-database.example.json` 与生产源容器、库名分开。数据库磁盘检查读取实际 data_directory；无法检查也不视为充足。原始备份应只读挂载给演练操作员，只有受保护完成集合才可恢复；pg_restore 不是运行不可信外部 archive 的沙盒。

## 4. 演练验收、健康与日志

每次演练保存：开始/结束时间、源/目标提交、备份 ID、每条命令原生退出码、manifest SHA-256、服务账号/根映射、JUnit/浏览器报告。数据明细和完整日志只留受保护目录；公开证据只发布固定错误码、测试数、摘要和去敏路径。

| 项目 | 必须取得的证据 |
| --- | --- |
| T1 引用一致 | 自动核对上述五张引用表；恢复后的 application.latest_ready_version_id、version.build_id/source_task_id、publication.version_id/status/url 和原备份相同，数据库 FK 存在；保存真实 PG 报告 |
| T2 示例无密钥 | `python -B tests/backup/record.py unit`；秘密哨兵仅存在根外及环境变量，备份中找不到；JSON 配置拒绝 password/URL 字段，命令不带密码；真实备份仍按机密处理 |
| T3 失败可见 | 同一专项注入 dump 失败、ENOSPC 预检、文件变化/篡改；原生/函数退出 1、STARTED 与 FAILED 同 operationId、无可用完成标志，上次备份字节不变 |
| T4 版本/源码包可用 | **真实恢复环境**登录原所有者，GET `/api/v0/versions/{versionId}/files`、`/files/content?path=...`、`/snapshot`；打开相同 versionId 的 preview（重新获取票据），真实 Chromium 截图/断言；下载 `/api/v0/versions/{versionId}/export`，核对导出 manifest 的版本和摘要，按固定 pnpm lock 独立安装/构建，保存 ZIP 摘要及退出码。查看历史发布详情/账本并核对产物字节；新发布仍只能由用户显式点击 |

先核对真实路由，操作时按 `contracts/openapi.v0.json` / `contracts/export` 提供认证及 CSRF。不要把 fixture 文件读取或静态网页可达当作平台恢复验收。`test_live.py` 的范围仍仅为双真实 PostgreSQL 恢复/文件一致性，输出 T4=NOT_RUN；T4 由新增 `test_application.mjs` 单独真实执行。复现：`python -B tests/backup/record.py application`，随后 `python -B tests/backup/export_application.py` 取得白名单证据。完整备份/会话/API 原日志始终留私有目录。

下载 ZIP 的独立构建复用现有真实隔离测试器：`node tests/export/clean-build.mjs <恢复环境下载的zip> <新的空工作目录> --expect-artifact-digest <原version的artifactDigest>`。必须 exit 0；exit 3 表示构建了但摘要不重现，也不通过。它使用固定 Node 镜像和受控锁文件，不借用宿主 node_modules。操作员保留浏览器截图、ZIP 与生成的 clean-build.json/log 在受保护证据目录。

`GET /api/health` 是公共 HTTP liveness，仅返回 `UP/codeless-api`，不说明 DB、卷或发布可用。操作员执行：

```sh
python3 scripts/backup/backup.py health --config /etc/codeless/backup.json
```

它真实查询 DB SELECT 1、逐文件哈希/路径校验并检查各卷余量；只有成功才返回 `STORAGE_DATABASE_READY`。不检查鉴权、HTTP read-path、写权限、浏览器、DNS/TLS 或公网发布，`applicationAcceptance` 保持 NOT_RUN。此全卷检查有 I/O 成本；日常 liveness 可频繁采样，完整存储校验在维护/每日巡检时执行。另以服务身份核对读写权限与挂载只读策略，数据库/HTTP 任一失败应告警，不能只看 HTTP200。

工具所有操作输出 JSON Lines，STARTED/终态使用同 `operationId`，成功再带 `backupId`；失败只写稳定错误码，不回显 SQL stderr、凭据、内容或环境。调度器必须同时检查非零退出码和终态事件；进程被强杀只有 STARTED 时按未完成告警。轮询“最近成功备份时间 + 存储副本 verify”，不能把日志缺失理解为成功。

排错关联：应用 ID → generation_tasks.id/task_events sequence → version/source_task_id/build_id → journal/receipts/evidence → publication UUID/deployments 账本。管理审计及 model_calls 的 usage UNKNOWN 保留未知。查看 `storage sweep PARTIAL`、`CLEANUP_LINK_REJECTED`、DraftConvergence WARN、`DEPLOYMENT_INTERRUPTED` 时按 `docs/recovery.md` 人工核对；不要根据模型文本或文件夹存在改数据库状态。

## 5. 磁盘不足与回退

预警阈值取 `reserveBytes`，到阈值停止新的生成/发布，保留读路径与最近成功版本；本工具只告警，不自动改产品状态。`DISK_SPACE_LOW` / `DATABASE_DISK_SPACE_LOW` / ENOSPC、dump/restore 非零、路径错误均让作业失败。检查数据库盘、agent/hosting 卷和备份盘各自容量，不能只看系统盘。未知/权限不足必须作为检查失败处理。

先扩容或更换备份目标，核对孤儿与引用后才按 D18 保留期回收可删临时文件；不删版本卷、发布引用、READY snapshots、审计或最近已验证备份。不要 `docker system prune --volumes`。恢复操作失败时继续使用原生产环境；演练不切生产 DNS/卷。备份失败不会覆盖上次备份，恢复失败不自动回滚或启动任何服务，人工依据证据决定下一步。

## 6. M4 P0 功能冻结（范围决定，不等于通过证明）

2026-10-28 起以 `docs/scope.md` 为上位边界；当前任务同步基线 `26b95e3`（最新 main，已合入 D22 A+B）。P0 只允许修复和验收，不新增框架/能力。涉及范围/契约变更交对应维护者，根锁、CI、迁移、公共契约本卡不修改。

| P0 冻结能力 | 既有依据 / 必须满足 |
| --- | --- |
| 鉴权、所有权、CSRF、基础后台 | auth/admin 契约；禁止跨用户/跨应用读取与发布 |
| Vue 受控生成三个场景 | scope 三场景；静态/Mock/LocalStorage；PLAN→GENERATE→VERIFY→REPAIR/READY |
| 真工具状态与预算 | build/browser 实际结果；3 repair、12 model、20 tool、50,000 runtime token、12 min；失败不覆盖最近可用版本 |
| 不可变版本、常驻预览、组件编辑 | versions/edit/mapping 契约；组件修改重新验证；截图和源码导出可复现 |
| 用户点击发布、失败保留旧地址 | deploy 契约；鉴权用户只能发布 VERIFIED；账本与实际托管探测一致 |
| 隔离、取消/重启/回收、容量 | D18/D22；无开放 shell、任意依赖、内网任意访问或平台密钥/socket 挂载 |
| 安装、运营、备份与交付 | README、环境模板、锁定版本、此手册、双 PG 恢复与真实浏览器/导出证据纳入 M4 必查 |

明确排除：React、独立 HTML 策略、生成后端/数据库/支付、AST 精确编辑、RAG、多 Agent、自动发布。平台与开发工具的 agent 协作不能被解释为产品范围新增。

| 未解决项 | 优先级/负责人 | 当前证据与解除条件 |
| --- | --- | --- |
| D23 T1/T4 独立空环境真实恢复 | 应用层缺证已解除，A | 双 PG native0；新增真实应用恢复 native0，原 owner/旧版本/发布/源码 ZIP 均可用，独立构建精确复现；同宿主独立 cluster/新进程，不扩大为 Linux 跨主机演练 |
| D23-B 全新安装、README/环境/版本/导出独立构建 | 本方复核通过，B/最后启用 PR | PR #77 @37688c8，5/5专项、独立再构建native0、真实请求报告与六项CI核验；本方没有重跑付费请求，组合启用仍核对最终精确 HEAD |
| 最终 HEAD 必需门禁与独立批准 | P0 合并阻塞，作者+另一成员 | 本卡新 HEAD 的真实检查；旧 D22 success 不继承；作者不自批、不合 main |
| 发布包布局/外置根/权限映射 | P0 启用阻塞，安装维护者 | 将既有分散部署对应到固定 release 与根映射，真实服务账号验证；不同拓扑先补守卫 |
| 真实模型 REPAIR 分支、完整前端交互 | P1 扩大试用前补齐，最后启用 PR | D22-AB-joint 已记录两用户真实自动 READY、压力屏障、SSE/取消/HTTP 发布和旧版本保留；本卡只读取该证据，没有重跑。REPAIR 为 NOT_ENCOUNTERED，HTTP 驱动不等于完整前端交互或公网验收 |
| 公网 DNS/TLS/网关慢客户端/长期负载与多实例总限额 | P1 扩大试用前关闭，环境维护者 | 本机/受控容量样本非 SLA；部署与公网独立验收，不能因恢复目录有 URL 就写通过 |
| 真实 RTO、异机加密存储及定时告警接入 | P1 运维启用前关闭，运维维护者 | 当前只有流程与本地失败测试，需真实计时、存储读回和调度告警证据 |

此清单保留未知/失败，不将问题关闭日期或责任人写成伪造的批准。P0 项都解除、四门禁与 ci-gate 对当前候选真实 success、另一成员批准且无阻塞讨论后，才具备合并/验收条件。
