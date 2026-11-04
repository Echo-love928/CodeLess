# D30-A 最终服务端交接与归档索引

日期：2026-11-04（Asia/Tokyo）。[D30-A草稿PR100](https://github.com/Echo-love928/CodeLess/pull/100)。**交接材料可审查，正式发布 HOLD；未创建正式版本标签、未合并、未切换生产。** 本页是 D30 当前入口；旧交接和发布说明中的失败快照保留历史含义。

## 版本身份与发布状态

| 角色 | 精确提交 / 核验 |
| --- | --- |
| 接手时分支 | D29-A `75f2ab8573c2f72e042a20ef77eae7a5450034c3`；未跟踪的十个他人目录原样保留。 |
| D30 基线 | 最新 main `6998a42395004d3e358d1cb127261e815456b05e`；取回后创建 `codex/d30-a-final-backend-main`，未写 main。 |
| 已通过技术验收的产品候选 | `1fe1389dee23efbb1b43c30f3ec1b8f546413087`，见 [D28 最终复审](../../tests/release/api/D28-B-FINAL-REVIEW.md)。 |
| 当前源码一致性 | [identity.json](../../tests/delivery/final-backend/evidence/identity.json)：1,973 个非 docs/tests/README 跟踪文件一致，包括服务、前端、runner、模板、prompt、契约、infra、scripts、锁、CI 和根配置；工作区对应文件无变化。不把新的材料提交当作重新部署。 |
| D30 最终提交 | 以本任务草稿 PR 的实时 40 位 head 为准；提交后单独采集其 CI。材料中不循环写入自身 SHA，也不沿用基线检查。 |

[远端回执](../../tests/delivery/final-backend/evidence/remote.json)确认：PR95@1fe 有 `yuanqizuimeng` 的 APPROVED；PR98@75f 有 `Echo-love928` 的 APPROVED。但两 PR 都是 **closed、draft=true、merged=false、mergedAt=null**；main 采用独立的每日汇总提交。这证明贡献及对应候选的审查来源，不能补造 GitHub 合并历史或把批准移给新的 main/D30 head。

基线 [CI run 41759838184](https://github.com/Echo-love928/CodeLess/actions/runs/41759838184) 六项全 success，见 [精确 SHA 回执](../../tests/delivery/final-backend/evidence/ci-6998a42.json)。正式标签尚无可签发的最终已批准 PR，D30-B / M6 联合核验待交接，**A03 BLOCKED**。即使已有 push 权限，也不能绕过这些条件打标签。

## 服务端接手清单

| 阅读/接手项目 | 资料与边界 |
| --- | --- |
| 范围与架构 | [scope](../scope.md)、[architecture](../architecture.md)、[contracts](../../contracts/README.md)。只支持受控 Vue 前端及静态/Mock/LocalStorage。 |
| HTTP 与状态 | [auth](../../contracts/auth/README.md)、[tasks](../../contracts/tasks/README.md)、[tools](../../contracts/tools/README.md)、[versions](../../contracts/versions/README.md)、[deploy](../../contracts/deploy/README.md)、[export](../../contracts/export/README.md)。无契约变更。 |
| 实现说明与讲解 | [D29 后端材料](backend.md)、[讲解脚本](../demo/backend-script.md)、[C1–C7代码/测试索引](../../tests/delivery/backend/claims.json)、[D29-A](../handoffs/D29-A.md)。真人彩排/完整录像在前置交接中已取消，不伪造记录。 |
| 业务与失败保护 | PLAN→GENERATE→VERIFY→REPAIR/READY；真实构建/浏览器和同源摘要决定状态；失败/取消保留最近可用版本。3 repair / 12 model / 20 tool / 50,000 runtime token / 12分钟。 |
| 后端独立验收 | [D28-A](../handoffs/D28-A.md)、[最终摘要](../../tests/release/api/evidence/d28-final-review/summary.json)：API437、权限8、预算20、部署身份9、源码258、包成员277为该候选的历史实测，D30未重新执行全部生产验收。 |
| 安装与运维 | [install](../install.md)、[environment](../environment.md)、[operations](../operations.md)、[recovery](../recovery.md)、[排障](../troubleshooting.md)。不得凭健康200启用流量。 |
| API发布包与回退 | [API包说明](../../infra/release/api/README.md)、[D28统一清单（历史00fd）](../../tests/release/api/d28-unified-candidate.json)。旧清单不能换标为1fe；最终成组包位置及可信摘要沿用下面受控索引。 |
| 用户流程/源码 | [用户手册](../user-guide.md)、[前端交付](frontend.md)、[D28 ZIP核验](../../tests/release/api/evidence/d28-final-review/export-verification.json)、[cover核验](../../tests/release/api/evidence/d28-final-review/live-cover.json)。新 [D30-B PR99](https://github.com/Echo-love928/CodeLess/pull/99) 已只读审查，见[三类结论](../../tests/delivery/final-backend/review-D30-B.md)：独立源码包构建/浏览器回执范围清楚，最终符合性回执缺失与完整门禁待闭环。 |

## 锁定环境与配置移交

沿用 Java21、Spring Boot4.1.1、Spring AI2.0.1、Maven3.9.11、Node24.22.1、pnpm12.6.0、PG17.6-alpine、Playwright1.60.0。Node依据 ADR-005 的既有独立安全升级；本卡未升级依赖、镜像或锁文件，Flyway仍 V1–V5。

| 配置集合 | 操作者必须核对 |
| --- | --- |
| 数据库/会话 | `CODELESS_DATABASE_URL/USER/PASSWORD`、生产TLS及cookie设置；账号初始化只在隔离安装环境进行。使用受保护环境文件，不在PR/命令参数里传密码。 |
| 模型 | 默认 `deterministic-mock`；REAL质量使用独立 deepseek 批次。`CODELESS_MODEL_PROVIDER/NAME/API_KEY` 只由私有环境注入，D30没有授权新付费评测。 |
| 执行/存储 | 按 operations 映射 agent、workspaces、modelAudit、fileAudit、hosting、release 和外置卷；固定原绝对路径、服务UID/GID/ACL、runner镜像与网络策略。 |
| 发布/截图 | 仓库默认关闭开关与实际D28已验部署配置分开。接手人从受保护部署配置核对 `CODELESS_PUBLICATION_ENABLED`、`CODELESS_COVER_ENABLED` 及 worker/root 映射；不可仅凭默认值声称生产未启用或擅自重启。 |
| 安全边界 | 生成容器无平台密钥/socket；无开放shell/任意依赖；浏览器/截图拒绝任意内网；已鉴权用户显式发布已验证不可变版本。 |

## 评测、预算与原件归档

D30执行 `python -B tests/delivery/final-backend/audit.py originals`：625个原件逐项核对SHA/长度；原14样本及新四样本 `report.mjs --check`、质量复算、源码/只读预算链复算四命令均原生0。见 [本轮原件回执](../../tests/delivery/final-backend/evidence/originals.json)及同目录 `eval-*.json`。保留历史派生文件原字节；不发模型请求、不重跑浏览器，不把报告校验当作新的模型成绩。

| 指标 | 可签收事实 |
| --- | --- |
| 需求 | **增量组合8/9**；原6项复用 + SHOW-02/03通过；TASK-03仍FAILED、保留分母。不是同次完整9/9。 |
| 故障 | 代码故障增量3/3，环境2/2复用。具体记录与组合规则见 [quality.json](../../tests/release/api/evidence/d28-final-review/quality.json)。 |
| 增量REAL | 22模型请求；input72,354 / output18,484，合计90,838；4份原Maven日志均实际各跑1项。属于D28公共运行时，不是D30开发token。 |
| 预算 | 43事件链连接原revision32；原14记录不变；累计保守上界1.547654元（含UNKNOWN占用0.4），余额0.452346；实际账单UNKNOWN。增量上界0.292580元。不是本轮可续花授权。 |
| D30新增 | REAL/付费模型请求0；本地确定性fixture累计usage UNKNOWN。个人开发token另记UNKNOWN。 |

机密原件不提交公开仓库。受控交接位置：`/srv/codeless-handoff/d28/20261102-cny2/` 下 `b-retest-57d1acf-20261103`、`b-public-closeout-1fe1389-20261103`、`candidate-1fe1389`；由已有SSH身份的成员读取，**D30未登录服务器、未新验证远端可达性**。本机取证布局及复现参数见 [D28复审入口](../../tests/release/api/D28-B-FINAL-REVIEW.md)。公开摘要是定位和完整性锚，不含认证trace、模型密钥、原提示词、会话或数据库dump。

## 备份/恢复交接

D30真实执行 `scripts/backup/backup.py verify --backup <保留的D23备份>`，原生0；[backup-verify.json](../../tests/delivery/final-backend/evidence/backup-verify.json)给出完整参数、私有日志路径与SHA。证明本机保留的真实演示备份可读取、清单完整；**不是新建的最终生产备份、不是今天重新restore或跨主机演练**。

历史 [D23应用恢复说明](../../tests/backup/README.md)已验证同宿主独立PG/新进程、旧版本/发布/源码ZIP和真实构建；其模型为命名mock。D28做过合成迁移及真实D23数据前迁读取，均保留各自候选身份。最终生产Linux停写、异机加密副本读回、UID/GID/ACL、RTO仍需运维维护者实测，不能套用旧本机结果。

接手顺序：按 [operations](../operations.md) §2停全部写入者（含timer/oneshot/worker/preview及其他副本）→源候选API/client及全部卷成组备份→verify并保护可信manifest摘要→加密异机保存/读回→独立空PG17.6及从未存在staging恢复→原绝对路径和权限映射→源版本check-restored→禁写配置启动/前迁→owner新登录核对旧版本、预览/ZIP/发布和拒绝路径→独立批准后启用。回退恢复迁移前成组备份到另一空环境；禁止旧JAR直接连前迁DB、Flyway repair/clean抹平错误或手工改成功。秘密、TLS、libpq配置另由受控渠道移交，不能放入备份源码包或公开PR。

公开材料的高置信秘密格式扫描见 [materials.json](../../tests/delivery/final-backend/evidence/materials.json)；备份校验器拒绝敏感文件名，但不宣称能证明所有内容中不存在任何秘密。真实备份含账号哈希/用户数据，始终按机密处理。

## 阶段门禁、正式标签与后续需求

四阶段本机真实结果与远端精确SHA结论分列于 [D30-A交接](../handoffs/D30-A.md)。已知本机API/runner/E2E失败保持原码；未满足“所有阶段通过”，不合并。正式签发须同时具备：最新main组合、最终PR head六项success、同伴新SHA批准、无未解决讨论、D30-B交付核验及M6结果。新增commit/base会使旧批准/CI失效，按受影响范围重查。

具权限的发布成员满足条件后，记录最终40位SHA、PR、检查/批准URL、不可变API/client及镜像摘要，使用受保护的 annotated tag（建议名 `codeless-v0-controlled-trial`，名称由维护者最终确认）。先 `git rev-parse <SHA>` / `git show <SHA>`，再 `git tag -a <tag> <SHA> -F <已审标签说明文件>`、`git push origin refs/tags/<tag>`；回读远端 tag peel 及Release资产摘要。标签说明应链接本索引与实际通过的PR，不移动/覆盖旧tag。本卡仅提供步骤，**没有执行创建/推送标签**。

| 后续项 | 负责人 / 解除条件 |
| --- | --- |
| 正式标签与最终批准 | 发布维护者+B：当前PR与六门禁、讨论及最终基线核验；PR95/98的closed-unmerged历史如实留档。 |
| D30-B互审/M6 | PR99@ae406ea已完成只读互审；B补offline-final回执和完整门禁，最终索引接入A归档。最后启用PR承担真实同候选联调，A只重查修复与受影响范围。 |
| TASK-03与质量扩展 | 后续需求，不列完成；保留旧分母/原件，新的REAL评测需单独预算授权。 |
| 历史Windows文件/清理事故 | 原根因UNKNOWN；依前置明确决定留档不再阻塞，不宣称修复。此次新本机失败仍独立保留。 |
| 运维/扩大试用 | 异机恢复、RTO、长期负载、多副本/SLA未验收；保持受控试用。 |
| 排除范围 | React、独立HTML、生成后端/支付、AST精编、RAG、多Agent、开放shell继续排除。 |

M6当前为 **HOLD**：平台/示例站点/源码/评测/手册/真实Git历史已有历史索引，但最终D30-B联合核验、正式版本与最终批准未完成，不能签“全部交付”。
