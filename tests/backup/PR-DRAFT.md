任务ID：D23-A｜运维配置、备份与恢复流程

数据库与私有卷原先没有成组备份/恢复流程，改变绝对数据路径还会使已冻结预览证据被拒绝。本 PR 实现停写备份、完整性校验、独立空集群恢复与启用前核验，并用真实应用恢复补齐原 owner 登录、既有版本预览、历史发布和源码包独立构建证据。

- 范围：backup、operations、对应测试和handoff；无生产API/runner、HTTP/数据库公共契约、迁移、依赖、根锁或CI变化。
- D23-A-01：全库dump、不可变版本/构建/账本/证据、工作区/审计、托管产物和固定release，逐文件摘要及原绝对根映射。
- D23-A-02：停写守卫、源前后比对；独立PG17 cluster、空库、新目录、单事务恢复。新T4先停源、封存原目录并销毁源库，再从备份jar/web/模板/runner恢复原路径。手册最小发布集合补齐runner跨目录读取的API network/site-policy.json，并先验证import图。
- D23-A-03：DB/卷健康、operationId/backupId、空间/ENOSPC、非零失败和最后完成标志；不自动清库、覆盖、删除备份或上线。
- D23-A-04：P0范围及问题优先级冻结，README/环境/版本/运营手册纳入M4。

验证与精确源码/命令/退出码见 candidate.json、evidence 和 D23-A handoff：

- 既有20项确定性/秘密哨兵/失败边界保留；双真实PG native0，B同提交补验原日志也已独立核对。
- 新真实应用恢复native0：原owner新登录，同一version/build/source/artifact/发布引用；预览刷新、托管内容和源码导出成功，ZIP与备份前逐字节一致；新固定Node容器/新store构建native0、精确复现原artifactDigest。缺index负向检查拒绝，归回原字节后才启用。原offline marker保持NOT_RUN，应用成功另有真实报告。
- 冻结实现b139757上规范复跑：unit20/20、双PG、真实应用恢复、白名单导出均native0；规范T4为 `evidence/2026-10-28T15-24-05.683508+00-00-application/`。后续仅证据/交接，不改被测逻辑，精确新HEAD CI独立刷新。
- 原4次fixture/打包/代理失败和初始Docker/权限门禁失败保留；未删断言、放宽隔离/超时或重试付费模型。只清自有资源，原镜像引用先保留后还原。
- A旧HEAD6fb9836与B37688c8各六项CI success已核验；本次新HEAD独立查询，不继承旧结果。新增专项独立执行，公共CI登记交维护者。

失败路径：写入者仍运行/未知、活动DB客户端、同源cluster/非空库/既有目录、重叠根、路径/链接/hardlink、密钥文件、dump/restore非零、源变化、缺件/篡改、磁盘不足、引用不一致和绝对路径搬迁均失败。证据导出拒绝最后一轮失败/未完成或被测源改变，不能借旧成功回填。

数据/配置：无迁移；真实备份机密保存，仅公开固定fixture ZIP、iframe截图、构建日志与白名单摘要，不公开数据库dump/完整备份、会话/key或API原日志。恢复后按安装器恢复uid/gid/ACL，环境凭据独立提供。测试为同宿主独立cluster/新JVM/preview/新数据目录；生产Linux/systemd、跨主机ACL、异机存储/告警与RTO仍待运营环境实测。

模型：命名deterministic-mock只提出文件，实际DB/build/Chromium/export决定状态；新增付费请求0，Mock总usage/开发累计token未知。B的1次真实PLAN证据只核验，不重复调用。

同伴复审：B PR #77 @37688c8，本方安装5/5、独立导出构建native0，来源/日志摘要与真实请求正负报告核对；B范围无阻塞，Bash插值边界为非阻塞建议，已由非作者账号正式APPROVED。三类结论见review-D23-B.md。A新补验仍需B按精确新HEAD复审，作者不自批。

剩余限制与合并条件：生产运营演练/独立批准仍待完成；最新main组合、当前HEAD全部必需检查真实success、无未解决阻塞讨论才具备合并条件。保持draft，不合并或切生产。
