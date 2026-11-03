# D29-A 后端讲解与换手演练脚本

日期：2026-11-04（Asia/Tokyo）。基线 `aefaca1`，运行版本必须在开场记录完整 Git SHA、部署身份和provider。约12分钟，A/B各自操作一遍；同一个agent运行两遍不能计作两人换手。证据入口为 [后端交付材料](../delivery/backend.md)，每个技术声明沿用 C1–C7 编号。

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

## 交换操作者与演练记录（11–12分钟）

A操作B的完整演示/用户手册；B操作本后端脚本。各自记录操作者、开始/结束时间、候选SHA、自己的身份、模式、每步输出、退出码、原件路径、阻碍与是否阻塞。操作失败可记录为一次真实失败演练，但不能将它标为“两人独立完成”。日内最后集成PR负责实际同候选联调。

| 记录项 | 本次状态 |
| --- | --- |
| A材料走查 | 已执行匿名访问与历史核验；stage/materials回执见 [D29-A交接](../handoffs/D29-A.md)。这是材料/命令走查，不是完整用户演示。 |
| A按B脚本完整演示 | NOT_EXECUTED：已读取PR97@28037c5脚本及手册、独立文档检查2/2；缺真人现场记录，且本机Java21/Docker不可用。源码走查不算完成演示，不复用D28的两用户录像充当D29。 |
| B按A后端脚本完整演示 | NOT_EXECUTED：尚无成员B本人操作记录。 |
| 现场资源阻碍 | 本机Docker Engine不可连接；当前JAVA_HOME指向无效的F盘Java17位置，标准路径未找到Java21；E2E因4173端口已占用退出1，未停止其他进程。以stage回执的原生失败为准。 |
| 阻碍影响 | D29-A-04、T3现场覆盖、D29-B当日互审和M6前置保持HOLD；访问和材料整理可独立交付。 |
| 录像 | 未制作；没有虚构录像链接、时长或演练成绩。 |

换手前先复核本脚本的本地链接和最终HEAD门禁；网络/凭据/资源不足时记录阻塞，不从历史绿色结果推断当前候选成功。
