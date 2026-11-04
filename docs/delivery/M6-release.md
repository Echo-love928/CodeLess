# D30 M6 最终组合与签发索引

本候选组合 main `6998a42395004d3e358d1cb127261e815456b05e`、已批准的 A `70a1751ea92bfeb67d2ed164e9c07a2de0ea14a6`，以及 B 的代理/超时关闭修复与用户接纳决定。组合只发生于 `codex/D30-B`，不修改 main。

平台、公开示例、源码ZIP独立运行、REAL评测、手册及真实Git历史直接复用[交付索引](index.md)和[验收决定](../../tests/delivery/client/evidence/timeout-acceptance.json)，不重跑已通过用例。TASK-03失败、8/9增量组合、未知账单、mock与REAL分账继续保留。

只为新组合候选补一条真实API↔runner↔Chromium同源联调：`node tests/delivery/client/m6-release.mjs integration`。只选择 `PreviewPlatformIntegrationTest#realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures`，不是重跑437个API、293个runner或80个E2E测试。该联调使用真实PostgreSQL、构建、鉴权、签名、预览、源版本绑定和重启/吊销检查，模型明确为deterministic-mock，不代表新增REAL效果评测。

同一40位候选分别执行 `m6-release.mjs api`、`client`、`bind`。前两者为交付构建及包验证，不运行已通过测试；后者核对API/client提交一致、所有共享源码字节与Git来源一致，确保新cleanup模块实际进入两个包。原始日志、JUnit、认证/浏览器材料只留忽略目录 `.local-data/d30-b/m6-final`，可公开投影与包摘要随最终签发一起交付。

正式标签拟用 `codeless-v0-controlled-trial`，创建前确认不存在，不覆盖或移动旧标签。签发要求：最终新候选已推送、原有必需门禁真实success、不同作者对该SHA独立批准、无未解决讨论、上述新增同源联调和包绑定通过。新候选推送后由仓库既有工作流检查，本地不手动重跑无关通过用例；不得用旧批准、旧绿灯或伪造原生0替代。

最新联调回执、精确候选、独立批准和签发/标签回读状态以 [PR99](https://github.com/Echo-love928/CodeLess/pull/99) 和最终 [Release](https://github.com/Echo-love928/CodeLess/releases/tag/codeless-v0-controlled-trial) 的签发材料为准，避免为记录自身SHA而循环改变候选。只有条件齐备才创建annotated tag并上传不可变API/client包与SHA256清单，随后回读tag peel和Release资产。

该版本为受控试用交付归档。签发不代表重部署生产、不启用付费provider，也不声称本轮完成新的生产异机恢复或RTO。已有恢复资料复用，运维限制继续随版本说明交付；不改变生成应用仅Vue/静态数据/Mock/LocalStorage的范围。
