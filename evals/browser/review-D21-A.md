# D21-A 只读互审

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
