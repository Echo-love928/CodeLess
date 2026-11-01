# D27-A：固定API候选包并验证安装、迁移和恢复

任务D27-A，成员A。基线 `f9257b7106415679e3f69f3db2a96fb0211faf44`；唯一选定API源码候选 `1f072dc361bd6e05b899390c7e84678711716f20`。已创建[草稿PR #93](https://github.com/Echo-love928/CodeLess/pull/93)，任务分支已推送；未自批、合并或部署。

原先API JAR、运行时依赖、配置和恢复过程没有绑定到一套可核验的固定发布产物。本变更从精确Git blob独立构建生产JAR，封存259项文件、可信manifest摘要与SHA256SUMS；打包前真实解析四条runner依赖闭包。同一封存包通过空库安装、V4→V5前迁和已有真实演示库的版本/源码/导出兼容验证，并提供源候选成组备份、独立恢复和失败回退说明。

- 当前CI阻塞：HEAD94ab4dd 的 API 428项有1失败（预期 ACTION_FAILED，实际 CLEANUP_FAILED），ci-gate失败；其它四门禁成功。原日志摘录保留，根因UNKNOWN。仅扩展现有API集成测试中的失败回执落盘/脱敏诊断，原断言及生产/隔离/超时/CI不变；本机定向1/1通过不等同修复，补丁后的完整远端检查待执行。
- 范围：`infra/release/api/**`、`scripts/release/**`、`docs/release-notes.md`、`tests/release/api/**`、`docs/handoffs/D27-A.md`。除上述一个现有API测试诊断外，API/runner生产源码、迁移、公共契约、根锁、CI及client目录无改动。
- 子项：A01不可覆盖产物/配置/摘要；A02真实PG空库、前迁与现有演示库读取；A03全库/源码/发布卷/release恢复绑定；A04能力与已知限制说明。
- 发布专项：unit16/16、live40检查、既有D23真实生成演示库22检查、四模块import、真实归档/258个Git blob/JAR五份迁移核验均native0。直接运行包内verify/verify-backup原生0；错误候选绑定原生1。原账号/版本/build/source/latestReady/publication和原ZIP保持，原备份字节不变。模型只有明确mock，构建/PG/浏览器真实。
- 阶段门禁：原static0（64 Node/206 UI）、API0（90类428项）、runner1（284/285，队列腾位rm的ENOTEMPTY机制未知）、原E2E1（两份Playwright）。修复本地锁定依赖链接后，Root E2E又因误发现旧私有peer共155项而超时，154通过/1未运行；两轮失败保留。固定提交干净worktree的原E2E80/80与完整平台browserExitCode0、原生0。未改配置/超时/断言，不重复runner掩盖失败，原ci-gate仍1，最终HEAD远端检查以本PR实时状态为准，不继承旧SHA成功。
- 失败/边界：篡改/缺多件/错manifest、路径/junction/硬链接、拒绝覆盖、匿名401/跨owner404/坏源码503、坏Flyway checksum确切诊断和原行保护。已撤回缺策略文件的旧包；验证器UTF-8、旧JAVA_HOME、urllib作用域、fixture seed就绪和PG Unix/TCP就绪失败全部保留，不归因于未证实的产品机制。
- 恢复/配置：秘密留包外，先停全部写入者，按源版本成组备份再独立恢复原绝对路径，首启禁任务/agent/worker/sweep/cover，真实读验收后再经独立批准。回退恢复源候选全套到另一个空环境；不降级SQL或直接换旧JAR连接前迁库。
- 产物：约31.6MB tar.gz，SHA256 `47a058ef65b644707fca763e5510a002ae112a90fa0db802af41be1a98041219`；manifest SHA256 `30204e1510a7715a8d985028d8505f33d41e4c9392145fc32600dcf053614f26`。清单与精确证据路径见candidate.json和D27-A交接；机密备份、原日志、会话和密钥不提交。
- B互审：PR92 @238cd3d，独立3项测试0、runner.tar精确复算匹配；文档的runner-only根缺后端agent-runner桥，需补桥或明确A完整repository映射。B公网平台T1/真实认证隔离及唯一组合提交未完成。精确B HEAD六项CI成功仅属于B，不能解除上述缺口或A原失败。未发APPROVED。

保持draft/HOLD。剩余项为runner原生失败、B布局契约与同提交组合/公网验证、Linux停写/异机ACL/RTO、D26真实质量和生产capture历史HOLD。另一成员批准、最新main、最终HEAD必需检查真实success且无未解决讨论之前不得合并。
