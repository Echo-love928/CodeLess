# D21-A 只读互审

## 增量复核：0d831a7（2026-10-24，已发布Comment）

审查对象 `0d831a7730c7df542961553a2e68e41bf84b858e`，base `e69d8c6fc1d117daaebc58b94b63c75840b6efdd`。
按用户本轮明确要求，已在PR63发布 [Comment review 5638353778](https://github.com/Echo-love928/CodeLess/pull/63#pullrequestreview-5638353778)，锚定该提交；没有批准、合并或修改A/main。

### 阻塞问题

- 真实验收仍不足，需求3/9、代码故障0/3、环境故障1/2；原P1/P2代码问题保持解除。

### 建议

- `sync-gate-attribution.json` 的 `e2e.runs[0].result` 称Playwright为verify:e2e最后一步，应改正：当前 `apps/web/package.json` 的smoke在其后还运行D20 full。
- Windows清理竞态继续单列，不直接将taskkill 255放宽为清理成功；本轮未改平台实现。

### 已核验内容

- `git range-diff bc3d00e..342b8b0 e69d8c6..7084686`四项全部为`=`，可沿用前次32测试/12反例/184校验/47输入摘要及复算结论，未重复运行未改变的评测。
- 342b8b0与0d831a7的评测脚本、测试、runs原始批次无差异；7084686..0d831a7仅有四个指定文档/证据文件。
- 新增9条命令保留e2e首次失败及重跑通过、API失败，未覆盖原结果；7084686树6a3b351与归因文件候选树相符。
- 已核对capture.mjs的退出128与附加关闭证据条件；作者120次对照的10/8次失败及私有日志摘要没有在本轮独立重跑或逐日志核验。
- 精确HEAD远端运行40095500638六项SUCCESS；独立读取e2e日志确认75项及D20完整双用户链PASSED、browserExitCode=0。没有将远端成功回填为本地API通过。

---

## 增量复审：342b8b0（2026-10-24）

当前对象为 PR63 HEAD `342b8b07b6a592c46898056f460fd13e6e6c6f2a`；仅核对相对 `6e707c0` 的修复及受影响范围。
以下旧审查和旧反例证据保留为历史，不代表当前 P1/P2 仍存在；没有修改 A 分支、原始记录或 main，没有发布批准或合并。

### 阻塞问题

- 原“真实验收证据不足”仍未解决：需求3/9、代码故障0/3、环境故障1/2，六项真实编辑尚缺证据；不能用 CI 成功替代。
  `evals/generation/evidence/2026-10-24/network-probe.json` 记录 F2 复发，未启动新批次是保留冻结样本的正确处理。
- 原 P1/P2 代码阻塞解除：`scripts/eval/ledger.mjs` 的 `execution()` 和 `sampleMetrics()` 拒绝非零、超时、信号、启动失败、缺失及无效结果；
  无 modelCalls 时单样本和聚合精确用量保持 null，缺失/不可读 journal 不把工具槽、计费、验证次数记成0。

### 建议

- 等网络和组件映射条件恢复后补完整新批次；维护者未确定不同合并口径，本轮保持未批准、不合并。
- 不要求为消除 squash 历史而重写真实证据引用的 c25b722；以有效合并结果及精确 HEAD 检查审查，不把旧分支的树间差异当作删除 main 测试。

### 已核验内容

- 从固定SHA独立提取只读副本。`node tests/eval/generation/mutation.mjs` 原生exit0：未变异的32项测试通过，12个负向对照全部检出。
- `verifyBatch()` 184/184；`checkReport()` 为true；新版报告47个输入摘要与旧版逐项一致。
  `git diff 6e707c0 342b8b0 -- evals/generation/runs` 仅有 report.json/report.md，原始样本未改；首轮/最终3/9和token数字不变。
- 新增 `integrity.test.mjs` 覆盖原始 SHOW-01 三个复现及其扩展边界、进程事件一致性、缺调用记录和不可读日志。
  `scripts/run-static.mjs` 只增加评测测试登记，没有削弱原有断言。
- GitHub运行40064641526对应精确HEAD，static/api/runner/e2e/infra/ci-gate六项SUCCESS；不把此结论改写为本地API通过。

---

对象：[PR63](https://github.com/Echo-love928/CodeLess/pull/63)，HEAD
`6e707c0ffdd189e4c268d5bf405fb543c8e7ce54`，base `7863d10`。2026-10-24 Asia/Tokyo。
以agent-reach/GitHub CLI只读获取；未评论、批准、修改A分支或合并。

## 阻塞问题

**[P1] 外层harness异常仍可能被计为首轮/最终成功。** `scripts/eval/ledger.mjs:102,119`
保存invocation信息，却只用READY和record.harnessError判定finalSuccess；
`scripts/eval/verify-batch.mjs:51`只检查attempt，没有要求原生exit0/无signal/无超时。
只读调用 `sampleMetrics`，保持本批SHOW-01原record不变，分别传入
`invocation:{exitCode:1,timedOut:false}` 和 `{exitCode:null,timedOut:true}`，
两次都返回 `firstPass:true,finalSuccess:true,failure:null`，预期均应不成功。
Maven/JVM在record写完后异常退出或被截止时，报告因此可能过计。
建议A将执行结果纳入成功条件，并增加非零、超时、缺失invocation的反例。
本次原批invocation正常，因此该发现不改变当前3/9；复现不修改原批、不发模型请求。
证据 `evidence/a-invocation-gap.json`。B采集器对非零exit/超时另行拒绝，不读取A成功计数。

真实质量验收仍受阻。A原始批次明确保留6/9个 `MODEL_NETWORK` 需求失败、代码故障0/3修复成功及环境故障1/2通过。
这些结果没有达到≥8/9或代码故障可修复的目标；远端CI通过不能代替真实质量验收。
已有F1/F2/F3的归因边界由A文档保留，本审查不扩写为已确定的模型质量缺陷。
`evals/generation/runs/.../report.json`、`docs/handoffs/D21-A.md:54` 可复现。

真实组件编辑另受映射阻塞：三份READY源码重建的catalog中，本卡目标 `HomePage.vue`/`WorkCard.vue`/
`TasksPage.vue` 缺少组件ID；不得向原始源码注入marker后冒称对原版本完成可视化编辑。
B记录六项NOT_EXECUTED，交D24/D26及最后启用PR处理。

## 建议

- 在最后启用PR登记A的 `tests/eval/generation/*.test.mjs`，当前A将登记留给维护者，未擅改公共static入口。
- 网络修复后重新发起完整新批次，保留此批次全部失败；确认生成组件具有可选中标识后再执行真实六项编辑。
- GitHub三点diff包含已经合入main的D20/Node历史：A分支从squash前历史继续。
  树对树比较 `git diff origin/main origin/codex/d21-a-real-eval` 发现除评测新增文件外还有CI与Chromium测试差异；
  A负责者应同步基线并让最终PR只保留预期变更，本卡不替其改分支。

## 已核验内容

- 九个ID及任务ID唯一完整，展示/任务/目录各三项；B从冻结输入与每个record自动采集，不使用A报告的成功数字。
- A `ledger.mjs` 的KNOWN/UNKNOWN/PENDING分账，缺一半usage及缺任务记录保持null；已知token只作为下限。
- CODE故障需首次失败、CODE/REPAIR、1..3轮、最终READY、actions不变、源码变化；环境故障禁止REPAIR/文件写循环。
- 一次性批次不重启已开始样本，缺失样本留在分母；未删除失败断言、变更TLS或放宽运行时预算。
- `node .../scripts/eval/report.mjs <batch> --check` 退出0，原始记录复算逐字节一致。
- `node --test .../ledger.test.mjs .../report.test.mjs` 正常权限下17/17、退出0。
  首次沙箱运行16/17，重命名临时目录EPERM；正常权限对照只解除文件访问限制，没有改测试或重试业务模型。
- B独立Docker/Vue/Chromium源码重放：SHOW-01、SHOW-02、TASK-01全部行为通过；六个原失败保持失败，最终3/9。
- 查询精确A HEAD六项CI均SUCCESS、reviews=[]；不继承到B，也不构成对B的批准。

查看/复算命令和本地失败信息见B交接；精确行号应以固定SHA源码为准。本次为证据审查，不代替正式独立批准。
