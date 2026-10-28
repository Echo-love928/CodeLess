# D22-B 只读互审

## 2026-10-28 后续材料更新

用户指定参考B `34f3901`。已独立核对其部署机匿名报告SHA256=`7fd96b8758c47146d6de05149d2a132366a5ff56784a7f450f00b8646a118869` 与manifest匹配；报告明确deterministic-mock/paid0，记录部署机容量10/10、runner4/4、资源80/80及两用户完整产品PASSED，发布UNKNOWN通过真实事务屏障复现后在验收同步层修正，旧失败没有回填。本方核对匿名数据/来源与范围，没有重跑B私有62文件归档或代用户批准。下文“剩余集成阻塞”的旧UNKNOWN描述是01aa4f9时的历史，不能继续当作34f3901尚未处理；真实模型自动完整链路、最终启用组合和公网/长期/多实例验收仍需另做。

A本轮已另在部署机完成一次真实Flash槽位/排队/取消/超时/普通HTTP补验，源数据与命令见D22-A当前交接；公共OpenAPI六个容量响应也已实际落地到A候选，由A按用户授权单一维护，不再只是提案。最终精确HEAD CI及用户批准仍各自核验。

2026-10-28（Asia/Tokyo）复审 [PR #74](https://github.com/Echo-love928/CodeLess/pull/74) 精确候选 `01aa4f944be469e8ceae87713f1e3d15d8769a77`，base `dcb3866`。首审 a518d3b，原始报告补证审至 e1db36a，历史导出增量审至 ffc6890；本次只检查 ffc6890..01aa4f9 及受影响 T2。没有切换/修改 B 分支，没有执行 B 的 Docker 压力脚本或提交批准。

## 阻塞问题

**原 P2（OOM 测量屏障）已解除，限于“OOM 确认后 API 可响应”的结论。** `api-isolation.mjs:130–140` 先释放分配器，等待 Docker Running+OOMKilled，再读取 cgroup memory.events 的 oom_kill>0 和 96MiB 上限，之后才查询；查询结束确认 guardian 仍 Running/OOMKilled，最后发 SIGUSR2。`fixtures/pressure-entry.mjs:5–13` 在宿主释放前不分配，释放后再延迟 500ms。负向对照发生在释放前，不能归入 OOM 样本。故障清理后另发直接查询（`:151`）。未声称覆盖分配器峰值的每个瞬间。

**原 P1（缺原始报告）保持解除。** 当前 manifest 共 10 份报告，独立按 Git blob 字节核对 SHA256、status、canonical，10/10 一致，失败历史仍保留。历史 Running-only 原报告保持原生 PASSED，但新审计明确拒绝其 T2 资格。

**剩余集成阻塞未解除：** B 提交的 `evidence/ab-integration.json` 保留 A+B 全产品 native1/browser1；`tests/e2e/full/business.acceptance.ts:131` 期待 SUCCEEDED、实际 UNKNOWN，尽管已有 2 READY、2 成功构建、1 PUBLISHED，事后账本有 SUCCEEDED。本方只读定位 `services/api/.../deploy/PublicationService.java:117–123,167–169`：SQL 状态与 afterCommit 账本分别读取，失配时明确 UNKNOWN；与该时序窗口相容，但尚未独立复现因果，不能据此宣称根因已证实、原测试通过或修复完成。发布/全链维护者需保留原断言，针对提交与账本追加之间的窗口建立确定性复现，再验证完整联调。此次不夹带发布实现修改。

公共 429/503 契约同步、生产部署机器/真实公网模型/多实例总容量校准和独立批准仍待完成。T2 补证不解除这些限制。

## 建议

保持报告口径：每组 80 个 HTTP 查询中，10 个在 OOM 确认后、10 个在 CPU 屏障后、10 个为压力前对照、30 个在三类故障清理后，另 20 个基线/收尾。不得把 80 个全部标为“峰值 OOM 期间”。真实部署验收仍由最后启用功能的 PR 承担，不放宽资源隔离或重试至绿。

## 已核验内容

- 独立命令 `node tests/performance/api/review-peer.mjs`，**native0**。它从精确 B Git 对象复制已审过的 JSON/摘要/时序测试，仅执行 `node --test .../evidence.test.mjs .../api-evidence.test.mjs`，**3/3，0 fail/skip**；未运行容器、模型或发布。命令、源码摘要和日志位于本卡 `evidence/peer-01aa4f9/{command.json,audit.log,summary.json}`，原样报告/测试位于 `source/`。
- B 与 A+B 两份报告均有 80/80 HTTP200，分别各 10 个 OOM 确认后样本，OOM 组 max=5.7829ms / 8.3266ms；检查单调钟先后、每组同容器 ID、CPU 子进程与 usage 增长、真实 exit137/OOM、artifact=null、精确容器/workspace 清理及清理后查询。原始两个报告均 canonical=false，未转成干净候选通过。
- 三项测试独立通过：原样报告完整性；新屏障/清理时序；旧 Running-only 报告及人工提前的 GET 被拒绝。本方附加检查也验证所有 113 个 A+B API 生产文件与 A 精确 `9c5cf47` 内容相符，仅为 CRLF checkout 字节差异；AB harness 两个脚本为 CRLF 匹配、两个 fixture 为 Git 原字节匹配。原始报告与摘要未改写。B 早一轮未采集 apiSources，未追溯补造。
- 只读差异确认 CPU/内存/PID/网络/只读挂载等生产安全限制未弱化；此次没有改生产 runner/infra、API、公共契约、锁文件或 CI，未增加构建重试。首审的精确回收、A→A→B→A 内容/摘要/回执、trial 只收紧限制的结论保持有效。
- 2026-10-28T04:41:12Z 独立 GitHub 查询：B `01aa4f9` 与 A `9c5cf47` 各自 static/api/runner/e2e/infra-preflight/ci-gate 六项均 completed/success，快照 `evidence/peer-01aa4f9/pr-checks.json`。B [run 40624152417](https://github.com/Echo-love928/CodeLess/actions/runs/40624152417)，A [run 40532119477](https://github.com/Echo-love928/CodeLess/actions/runs/40532119477)。这些 success 不回填本地历史失败，也不替代 A+B 失败组合或后续新 HEAD 检查。

接手：T2 屏障复审完成，无新增 T2 阻塞；发布/全链维护者接手 UNKNOWN 确定性复现和完整组合验收，部署负责人接手真实容量校准，公共契约维护者接手响应同步。当前没有执行正式批准或合并。
