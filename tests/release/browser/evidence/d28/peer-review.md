# D28-B 对 D28-A 的只读互审

审查对象：[PR94](https://github.com/Echo-love928/CodeLess/pull/94)，精确 HEAD `438c0f5e81ba08656bf110f162beb15e5d6ba21d`，base `2be793dc3318c2308d18a7fd45afb201342206a7`。2026-11-02（Asia/Tokyo）读取远端元数据、41个文件差异、全部新增Python验收脚本和主要测试证据。结论 **HOLD，未批准、未发送 review/comment、未合并**。

## 阻塞问题

1. **当前精确HEAD的必需E2E/ci-gate失败**。`peer-remote.json` 与原生 `gh run view 41321844346 --log-failed` 的私有原日志摘要在 `peer-a.json`。79 passed / 1 did not run / 2 suite errors，原全局120秒截止及teardown超时，后接完整平台suite未启动。`apps/web/playwright.config.ts:7` 是原有截止配置，PR94未修改它。日志出现Vite代理8080拒绝连接，但这不充分证明总截止超时的根因，机制 **UNKNOWN**。复现/取证：`gh pr checks 94 --repo Echo-love928/CodeLess --json name,state,link`、`gh run view 41321844346 --repo Echo-love928/CodeLess --log-failed`。不可沿用文档中旧基线六绿或本地80项通过；修复后须新候选和受影响完整入口，不能单独延长截止放行。
2. **同伴本机API原失败仍未关闭**。`tests/release/api/evidence/d28/api-failure.json:4` 绑定 `RoundFiveRegressionTest.controlBareDoneWithoutChangingSourceStillStopsAsNoProgress`：预期NO_PROGRESS，实际ARTIFACT_INVALID；报告记录真实build0后rename EPERM。A保留46项原始现场的SHA；本机未获得私有现场或占用追踪，不将报告一致性当作根因复现。复现由API/runner维护者在A原环境执行原完整 `pnpm verify:api` 并追踪产物提升；当前PR远端API成功不覆盖该本机失败。
3. **完整M5与实物身份尚不具备通过条件**。`tests/release/api/d28-candidate.json:29` 仍列历史ENOTEMPTY/CLEANUP_FAILED、真实模型/生产cover、同源私有包和部署身份缺口。A封存包/原私有日志在另一主机，B本次只能复算公开manifest/receipt，不能声称重新核验JAR实物或当前受保护服务器。另有61历史API/runner CI原日志摘要差异，应由持有方提供同摘要原件及获取方式；未归一化或改写旧摘要。上述均阻塞总体放行，不要求A在本卡跨模块修改。

## 建议

- `docs/acceptance/backend.md:59` 的“新PR检查另行运行/未等待”为发布时快照；下一次交接应追加本次精确438c0f5的远端E2E失败，避免读者只看到基线六绿。保留历史快照与原失败。
- `tests/release/api/d28_record.py:51` 硬编码A机Java路径，当前入口跨机器不可直接复用。建议后续在单独允许范围中接受显式JAVA_HOME并验证Java21，不改变测试和版本锁。本次B已使用自己的独立入口，没有试改A脚本。

## 已核验内容

- 41个新增文件全部位于A允许目录，无产品、契约、依赖锁、CI、迁移、权限或预算变更；精确逐文件SHA见 `peer-a.json`。
- A公开summary引用的12份实际receipt的SHA逐一匹配，未发现公开引用摘要不一致。原始私有日志/成组归档不可用，未宣称已重算。
- 独立执行A `test_d28_acceptance.py`：4项通过、原生0；覆盖stale HEAD、skip/neutral/未知/失败/取消、缺件、重复检查名。它们是证据接纳负对照，不是产品测试。
- A明确保留本机427/428、ci-gate1，空/未知字段未填0，恢复fixture与真实构建/浏览器、mock与真实模型效果分账。预算、权限、取消/恢复、不可变版本有具体JUnit关联；这部分核验为公开报告审查，未替代原环境执行。
- 当前PR无review提交、无inline thread；不代表已获独立批准，也不关闭报告中的严重问题。公开差异定向审查未见实际凭据；认证trace、备份、ZIP和原日志保持私有。

本次B记录到位后，A旧“D28-B材料未出现”属于当时快照；维护者可从B草稿PR取得本次候选/结果，继续真实联调与最终复核。
