# D29-A 后端讲解脚本

日期：2026-11-04（Asia/Tokyo）。基线 `aefaca1`，运行版本必须在开场记录完整 Git SHA、部署身份和provider。约12分钟。按用户最新反馈，真人彩排和完整录像已取消；以下提供可交接的讲解顺序与可选操作参考，不要求补真人或视频记录。证据入口为 [后端交付材料](../delivery/backend.md)，每个技术声明沿用 C1–C7 编号。

## 开场与访问（0–2分钟）

操作者先说：“CodeLess只生成受控Vue前端，数据限静态/Mock/LocalStorage；本次是现场运行、历史证据讲解或录像回放中的哪一种。”在记录中写明模式；录像注明录制时间、候选与路径，不称为当前现场。

1. 用未登录浏览器打开 [仓库](https://github.com/Echo-love928/CodeLess) 与 README；或执行 `python tests/delivery/backend/audit.py online` 展示无认证200和固定README摘要。仓库不可读即记录失败。
2. 展示 `git branch --show-current`、`git rev-parse HEAD` 与历史回执；说明主线按天汇总，成员贡献需查看PR94/95作者与评审。不要将closed称为merged。
3. 按 README/安装指南检查锁定Node、pnpm、Java21、Docker和Chromium；缺项先记录并停止依赖该资源的现场链路。历史日志可以继续讲解，但必须标注“D28历史证据”。

## 正常链路与真值（2–5分钟，C1/C6）

前置：使用自己的受控演示账号，按 [安装指南](../install.md) 启动隔离本地环境；不使用日志/trace中的他人Cookie。自动化辅助入口是 `node tests/e2e/full/record-command.mjs full`，它是明确的deterministic-mock provider，真实PG/Docker/Chromium；全链路的操作说明和原件见 [full README](../../tests/e2e/full/README.md)。

1. 登录后创建应用，输入“个人展示页，含个人介绍、三个作品和联系信息，静态数据”；观察任务事件中 PLAN、GENERATE、VERIFY，最终以真实结果显示 READY 或 FAILED。
2. 展示 taskId、versionId、buildId、真实exitCode、verification结果和source/artifact digest。解释 `AgentEvidence.validate` 如何拒绝错误摘要/未知退出码；打开 C1 的反例测试。不能只展示绿色按钮推断工具成功。
3. 预览与版本页确认同一不可变版本；由操作者点击发布，检查URL、截图和ZIP对应的version/digest。现场未配置公网时，标注“本地隔离发布fixture”，另打开D28 `export-cover.json`、`export-verification.json`、`live-cover.json` 讲解历史实物，不称为本次公网发布。
4. 记录真实输出路径和命令退出码。若当前界面与文字步骤不一致，截图存本机私有目录并登记阻碍，不改B的手册/界面。

## 有限修复与失败（5–8分钟，C2/C4）

演示故障使用已有确定性测试fixture，不现场编造模型能力或修改生产任务：

```powershell
# 前置：JAVA_HOME指向Java21；Docker与配套Chromium可用
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=AgentLoopIntegrationTest,RepairLoopIntegrationTest,RepairPolicyTest' test
```

1. 打开 `D10AT1_missingComponentRepairRebuildsAndPassesRealBrowserWithRecordedDiff` 的同次日志/JUnit，指出原构建失败、REPAIR、真实重建/浏览器与新版本；不能把测试名字本身当通过证据。
2. 打开 `D10AT2_changingButUnrepairableSourceStopsAfterThreeRounds` 和 `D10AT2_sameFailureAndUnchangedSourceStopsEarly`：最多3轮，相同源码与指纹提前停止。
3. 打开 `infrastructureFailureStopsWithoutCallingRepairModel`、`D10AT3_cancelDuringRepairRetainsUsageAndRejectsLateMutation`：网络/环境故障不盲修，取消后的晚到写入被拒绝，最近可用版本仍保留。若未新执行，明确引用D28候选CI及原证据，不填新JUnit为成功。

## 预算、隔离和效果边界（8–11分钟，C3/C5/C7）

展示 `RuntimeBudget.java` 的12次模型、20工具、50000token、3轮修复，以及数据库任务12分钟deadline。说明先预约、usage实测后结算，未知计量保留估算，开发agent预算与平台运行时分账；不把D28财务上界当实际账单。

展示 `RepairPolicyTest` 的 `missingCountersUseAvailableUsageAndKeepAnExplicitEstimate` 与 `outputAllowanceShrinksToTheRemainingCapInsteadOfRefusingAFittingRequest`，指出256可请求、255不足即拒绝。再展示文件工具registry、runner隔离测试和D28角色权限回执；日志、源码注释、网页文本不是权限指令。网络拒绝须有真实断言，超时本身不证明隔离。

最后打开D28 `quality.json`：需求8/9为历史成功项复用加受影响复评的组合，TASK-03 FAILED仍在分母；生产provider记录为deterministic-mock。本次不启动REAL批次，真实模型效果不从mock推导。

## 材料走查与可选操作记录（11–12分钟）

按 C1–C7 核对脚本、源码、测试与历史回执入口；材料校验执行 `python tests/delivery/backend/audit.py offline`。如将来自选实际操作，可记录时间、候选SHA、自己的身份、模式、输出、退出码、原件路径和失败；这些是可选记录字段，不是本轮必需交付。脚本本身不能作为已经实际演示的证明。

| 记录项 | 本次状态 |
| --- | --- |
| A材料走查 | 已执行匿名访问与历史核验；stage/materials回执见 [D29-A交接](../handoffs/D29-A.md)。这是材料/命令走查，不是完整用户演示。 |
| B最终材料走查 | PR97@cc60340已作增量复核，原文档测试3/3；28037c5的2/2及旧发现保留为历史，详见D29-A交接。源码走查不冒充现场演示。 |
| 真人彩排 | REMOVED_FROM_SCOPE：用户已取消，不列为未完成或阻塞。 |
| 完整录像 | REMOVED_FROM_SCOPE：用户已取消，不要求制作、播放或补造链接。 |
| 原本机资源失败 | 原Java/Docker/4173端口失败在stage回执保留；旧3d15a92远端六门禁已真实success。新HEAD仍须重新读取，二者分列。 |
| 当前接纳 | 按调整后的材料范围验证；合并仍取决于新HEAD门禁和另一成员批准。 |

使用本脚本前复核本地链接和实际运行版本；网络/凭据/资源不足时如实记录，不从历史绿色结果推断新的现场操作成功。
