# D29-A 后端仓库交付材料

日期：2026-11-04（Asia/Tokyo）。本任务只整理材料，不增加功能或改动冻结版本。D29 基线为 `aefaca193af3019bcadbcf8fdf3f6424baee750c`，分支 `codex/d29-a-repository-backend`。当前材料与门禁状态见 [D29-A 交接](../handoffs/D29-A.md)。

## 访问与仓库提交材料

仓库入口为 [Echo-love928/CodeLess](https://github.com/Echo-love928/CodeLess)，默认分支 main。[匿名访问回执](../../tests/delivery/backend/evidence/access.json) 是无 Authorization、Cookie、浏览器会话的真实 HTTP GET：仓库元数据和固定 main SHA 的 README 均须为 200，仓库必须为 public。它证明只读访问，不证明任何账号具备写入或审批权限；公开阅读无需评审账号登录。命令：

```powershell
python tests/delivery/backend/audit.py online
```

命令同时产生 [真实历史与 PR 回执](../../tests/delivery/backend/evidence/history.json)。网络/权限错误会非零退出并保存 error 回执；禁止把访问失败写成通过。交付新版本时重新采集，旧快照不保证未来权限。

| 成员职责 | 可核对的贡献与审查来源 |
| --- | --- |
| A：API、模型、后端验收与运维材料 | [PR94](https://github.com/Echo-love928/CodeLess/pull/94)，作者 `yuanqizuimeng`；Git head `148a6ab` 的显示名 `nacho`；以 PR 的 D28-A 标题及交接绑定角色。 |
| B：平台 UI、runner、交付体验及用户流程验收 | [PR95](https://github.com/Echo-love928/CodeLess/pull/95)，作者 `Echo-love928`，候选 `1fe1389`；[A 的批准记录](https://github.com/Echo-love928/CodeLess/pull/95#pullrequestreview-5753735658) 精确绑定该候选。 |

Git 显示名由提交者自报，不代表实名认证。当前 main 的 first-parent 历史按天汇总，`git shortlog -sn <基线>` 只有一个作者，**不能用主线作者数证明两人成员贡献**。必须保留 PR 作者、head、评审和每日交接共同追溯。实时 API 显示 PR94、95 均 closed、draft=true、merged=false、mergedAt=null；`merge_commit_sha` 非空也不能当成已合并证明。main 有独立 D28 汇总提交 aefaca1；其产品/契约/基础设施目录与 PR95 候选相同，不声称存在 GitHub merge 关系或由本任务补办历史批准。

可复现核验：

```powershell
git log -6 --first-parent --format='%H %an %s' aefaca193af3019bcadbcf8fdf3f6424baee750c
git shortlog -sn aefaca193af3019bcadbcf8fdf3f6424baee750c
git show -s --format='%H %an %s' 148a6ab
git show -s --format='%H %an %s' 1fe1389
git diff --exit-code 1fe1389 aefaca1 -- services apps templates prompts contracts infra
```

PR 原提交对象可能不在新 clone 的主线历史中。若 `git show` 报未知 revision，使用 GitHub 公开 PR commits 页，或显式 fetch `refs/pull/94/head`、`refs/pull/95/head` 到本地审查引用后核对完整 SHA；不要将 fetch 失败改写为无贡献。

## 架构、环境与可复现入口

| 阅读顺序 | 内容 |
| --- | --- |
| [README](../../README.md)、[scope](../scope.md) | Vue 受控模板；静态数据/Mock/LocalStorage；明确首版范围。 |
| [architecture](../architecture.md)、[contracts](../../contracts/README.md) | 单一生成策略、真值状态机、API/执行面隔离、v0 契约。 |
| [安装](../install.md)、[环境](../environment.md)、[排障](../troubleshooting.md) | 锁定版本、真实 PG/Docker/Chromium、账号初始化和清理方法。 |
| [服务端验收](../acceptance/backend.md)、[D28-A](../handoffs/D28-A.md) | D28 当前索引及历史失败，不把早期 HOLD 与最终候选混用。 |
| [后端讲解脚本](../demo/backend-script.md) | 操作者步骤、逐项声明与演练记录。 |

沿用 Java21、Boot4.1.1、Spring AI2.0.1、Maven3.9.11、Node24.22.1、pnpm12.6.0、PG17.6-alpine、Playwright1.60.0；以已锁文件/ADR为准。本任务不安装新版本、不修改依赖、CI、迁移或公共契约。`docs/task-state.md` 包含 D05 的历史适配器说明；当前管线以 `AgentLoop`、`AgentEvidence` 和 D28 实际验收为依据，不能引用 D05 的“未接模型”作为当前实现描述。

## 技术声明与证据索引

[claims.json](../../tests/delivery/backend/claims.json) 给出每条声明的代码符号、测试及原始证据路径；[材料校验回执](../../tests/delivery/backend/evidence/materials.json) 记录 SHA256、D28 原回执摘要核验和本地链接检查。索引检查通过只证明材料可定位且摘要一致，不表示重新执行了对应测试。

| 编号 | 讲解内容及边界 | 正常、失败及边界证据 |
| --- | --- | --- |
| C1 | PLAN→GENERATE→VERIFY→REPAIR/READY；模型不能设置终态。真实 build exit=0、浏览器 PASSED、源码/制品/截图摘要一致才能晋级。 | `AgentEvidence.validate`；`AgentLoopIntegrationTest` 的 mockProvider真实PG/Docker/浏览器场景及 wrongSourceArtifactAndScreenshotDigests 反例。 |
| C2 | 仅明确源码错误可修复；环境/网络/清理未知停止。最多3轮；相同指纹且源码不变提前停止。 | `RepairController.stop/classify`；`RepairLoopIntegrationTest` 的三轮、no progress、基础设施失败与原断言不能弱化场景。 |
| C3 | 12模型请求、20工具调用、50000运行时token、12分钟；先预约后执行。未知usage保留估算预约，不能写0。 | `RuntimeBudget`、`AgentRunStore`、`PlatformRepository`；`RepairPolicyTest` 的缺计数与255/256输出边界；`D10AT3_eachBudget...`。 |
| C4 | 取消/过期lease拒绝晚到mutation；失败保留最近可用版本。 | `TaskQueueService`；`D10AT3_cancel...`、`expiredDeadline...`、`D09AT3_realBuildFailure...`。 |
| C5 | 封闭文件工具和路径配额；构建容器非root、无平台密钥/socket；浏览器及截图限制网络。 | 工具契约、`tests/security/runner/{build,browser,network}.test.mjs`；D28 Linux角色权限8项。不是“绝对安全”或浏览器漏洞防护保证。 |
| C6 | 所有者显式发布已验证不可变版本；截图、下载与部署摘要绑定。 | deploy契约、`DeploymentRecordsTest`；D28 ZIP16成员和实际cover PNG回执。A复用B已有认证HTTP原件，没有新使用其Cookie。 |
| C7 | Mock证明编排，REAL质量单列。D28需求为增量组合8/9，代码故障3/3，环境故障2/2复用；TASK-03保留失败。 | D28 `quality.json` 和 `summary.json`；不是同一次完整9/9批次，也不是D29现场模型评测。 |

## 验收、秘密与现有限制

```powershell
python tests/delivery/backend/audit.py offline
python tests/delivery/backend/audit.py static
python tests/delivery/backend/audit.py api
python tests/delivery/backend/audit.py runner
python tests/delivery/backend/audit.py e2e
python tests/delivery/backend/audit.py ci --head <最终40位PR提交>
```

四个 stage 分别运行根 `corepack pnpm verify:*`，不修改断言、重试、隔离或成功条件。原生日志位于忽略的 `.local-data/d29-a/`，公开回执仅记录命令、退出码和日志摘要；既有测试重写历史 evidence 时，保存新观察并还原原字节。CI 快照私存，避免为记录最终SHA而再次改动该SHA；远端结果不得继承给后续提交。

T4 的扫描仅覆盖本卡交付材料，检查私钥头、已知token格式和带密码URL，输出仅含路径/行号/规则；不输出命中值。它不是历史全量秘密审计或所有格式的完备证明。原请求、Cookie、私钥、数据库备份、完整生产日志不得加入材料；D28仅链接已有去敏投影及其摘要。开发token实测未知；D29不启动付费模型，不续用D28剩余额度。真人换手、D29-B审查和最终门禁未完成时，M6前置保持HOLD。
