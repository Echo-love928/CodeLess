任务ID：D30-A｜最终服务端交接与版本归档

旧发布说明仍停在D27候选，接手人难以区分最终技术候选、汇总main与材料提交。本PR增加最终后端清单、配置/备份恢复说明、评测原件与预算链核验及归档索引；前置D30状态，完整保留历史失败，正式版本维持HOLD。

- 范围：docs/delivery/final-backend.md、docs/release-notes.md、docs/handoffs/D30-A.md和tests/delivery/final-backend；无产品/契约/依赖锁/CI/Flyway变更。
- 基线：main6998a42395004d3e358d1cb127261e815456b05e；1,973非材料跟踪文件与已验1fe1389候选一致。最终head以本PR实时SHA为准。
- 验证：625原件摘要/长度匹配；两批report --check及质量/预算复算四命令各0；真实保留D23备份verify0；公开访问/现有身份pull+push权限核验0；证据接收边界9/9。材料链接/历史摘要/高置信秘密扫描回执见handoff。
- 四阶段本机：static0、API1（JAVA_HOME无效）、runner1（含Docker引擎不可用）、E2E1（4173占用）；本机ci-gate派生FAILED。基线6998a42六远端success另列，不能继承为本PR成功；最终精确SHA六检查以Actions终态为准。
- 失败/未知：TASK-03保留FAILED，8/9为增量组合；账单、开发I/O和fixture累计usage UNKNOWN。早期采集失败保留；不弱化断言、隔离或重试。
- 模型/数据/配置：默认mock与历史REAL分账；本轮新增付费模型请求0，不部署、不迁移、不启用配置。机密备份/原始请求/会话/日志不提交。
- A03：未打标签。PR95和98有对应候选批准但closed/merged=false；当前D30-B/M6及新head批准未完成，权限可用也不能绕过签发条件。
- 同伴：已只读审查D30-B PR99@ae406ea的18文件；专项3/3及离线110链接/14历史摘要/60账本重算各原生0。存在所引用offline-final.json未提交、完整门禁尚未闭环的阻塞；三类结论见review-D30-B.md。请B审查本PR新SHA，作者不自批。
- 合并条件：最新main组合、六必需检查真实success、另一成员批准、无未解决讨论，最终M6输入齐全；未满足不合并。正式标签由具权限维护者按已通过最终PR创建。

开发input/output/total与计量来源UNKNOWN；本次平台新增REAL/付费0，历史D28账本单列。完整命令、原生退出、证据及接手项见docs/handoffs/D30-A.md。
