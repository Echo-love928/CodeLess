# D22-B runner 资源与冷暖构建测量

基线为远端 main `dcb3866d2ca52a3a595e5167bfefa60bb6e862c1`。任务分支 `codex/d22-b-runner-performance`，工作区 `.worktrees/d22-b`。main 原有未提交工作保留。

## 方法与可复现命令

使用仓库锁定的 Node24.22.1、Corepack pnpm12.6.0、Java21、Playwright1.60.0；不改依赖、公共契约、根脚本、CI或API生产代码。

```sh
corepack pnpm install --frozen-lockfile
node tests/performance/runner/record-command.mjs measure
node tests/performance/runner/record-command.mjs api
node tests/performance/runner/record-command.mjs gate
node tests/performance/runner/export-evidence.mjs
```

`measure` 进入现有 `verify:runner` glob（`tests/infra/performance-runner.test.mjs`），执行真实 Docker Vue 构建、Chromium检查/截图、CPU超时、日志洪泛及cgroup OOM；队列容量用生产队列和明确的阻塞capture依赖测量。`api` 启动当前生产API类、全新PostgreSQL17.6及真实HTTP，在单个独立worker负载下读取已登录用户和应用列表。复用D20-B的锁定Java/构建环境准备方法，未复用历史测试结果。

首个样本叫 **first-container**：新容器、新源码快照、新tmpfs，依赖已安装在只读镜像；后续 **warm-image** 样本仍逐次新建容器和tmpfs。没有清空宿主/VM page cache，不能称为整机硬冷启动或依赖首次下载安装。镜像准备时间不计入构建样本。每轮先生成独有镜像标签，再固定到确切sha256 ID，避免其他门禁重建共享标签后删除旧manifest造成竞态；结束只删除本轮独有标签。

构建耗时用单调钟包围完整 `runBuild`，含快照、Docker命令、构建、hash、清理及产物晋级。浏览器耗时包含worker启动、页面检查、受控断言、截图和关闭；`diagnostics.timingsMs` 按实际阶段累计，单列SCREENSHOT，不用相减估算。失败/未观察到的数据保留失败或null，不补0。

## 机器与首轮原始样本

2026-10-27（Asia/Tokyo），Windows10.0.26200，i7-13650HX，20逻辑CPU，RAM25,551,560,704字节；Docker Desktop29.9.2、cgroup v2、overlayfs，VM20 CPU、RAM12,428,419,072字节。每轮报告保存其实际机器配置和镜像ID。

首轮开发测量（最终队列fixture尚未修正，整轮**FAILED**，不作为最终通过记录）：

| 样本 | 构建ms | 浏览器含截图ms | 截图ms | 观察日志字节 |
| --- | ---: | ---: | ---: | ---: |
| A first-container | 5879.52 | 1648.14 | 43.53 | 619 |
| A warm-image | 5636.39 | 1632.39 | 24.78 | 619 |
| B warm-image | 5769.28 | 1534.11 | 25.79 | 619 |
| A warm-image | 5753.91 | 1598.23 | 23.17 | 619 |

这是一个首样本、三个后续样本的校准，样本数不足以推出生产P95/P99或冷暖差异显著性。后续最终轮及门禁内负载环境的完整观测保存到 `tests/performance/runner/evidence/`，以其原始退出码和源码身份为准。

代码候选 `cb04df4` 的干净专项 native0、4/4、canonical=true；同轮实际样本如下。trial的含义是更短的失败截止与更低日志保留，正常成功路径不会等待这些上限，不能据此声称它加快了编译。

| 样本 | 配置 | 构建ms | 浏览器含截图ms | 截图ms |
| --- | --- | ---: | ---: | ---: |
| A first-container | default | 5609.22 | 1438.74 | 18.82 |
| A warm-image | default | 5916.95 | 1901.95 | 20.19 |
| B warm-image | default | 5779.63 | 1599.06 | 24.00 |
| A warm-image | trial | 5691.99 | 1655.30 | 24.88 |

该轮第101项QUEUE_FULL拒绝耗时0.5321ms，peakActive=1；配置work以及消费后的artifact/evidence均0字节/0文件，确切worker/browser PID均已消失。报告 `evidence/2026-10-27T14-37-20.486Z-c8d6a06d-29fe-41ff-9583-435b693bc90d.json` 保留全部原始数据。后续a518d3b报告失败关闭断言专项亦4/4通过；其canonical=false原样保留。

## 配置调整

新增可信宿主可选 `trial` profile（`infra/runner/profiles.mjs`）：执行上限120秒→60秒，保留日志64KiB→16KiB。60秒约为首轮最大完整构建耗时的10倍；16KiB约为619字节正常日志的26倍。CPU、内存、swap、PID、tmpfs、产物和浏览器deadline均不放宽。此校准仅针对当前固定受控模板，未证明更大合法源码的吞吐，不替代部署机再次测量。

工厂显式调用 `createBuildRunner({ ..., profile: 'trial' })`；独立可信CLI可设置 `CODELESS_RUNNER_PROFILE=trial`。只有宿主选择配置；模型请求不增加字段。未知profile及放宽profile上限的override拒绝，允许进一步收紧。默认profile继续沿用原policy。Java `LocalBuildGateway` 的环境白名单不会转发这个变量，因此本PR**没有自动启用平台API的trial profile**；最后启用的维护者需在可信配置接线并联调，不应修改白名单接受任务数据。

第4个A样本使用trial，与默认A的产物摘要逐字相同；同一套真实日志洪泛验证16KiB截断、继续排空400,000字节、真实exit7和失败/无产物，不会把截断当成构建成功。代码没有增加构建重试。

## 资源上限、回收与缓存隔离

- 每次实际inspect：1 CPU、512MiB内存、memory-swap等于memory、128 PID、只读root/input、无网络、cap-drop ALL、no-new-privileges、Docker日志禁用；仅input/output两处bind，无共享可写缓存或Docker socket。OOM专用fixture收紧到96MiB并真实观察memory.events、Docker OOMKilled及exit137。
- 连续A→A→B→A使用不同任务UUID/容器/目录；A产物摘要复现，B摘要不同，各自JS仅有本owner标记；浏览器回执绑定相同build/source/artifact。复用的是只读镜像依赖，生成源码和Vite输出在一次性tmpfs，A/B间不共享可写状态。
- 逐任务清理断言：Docker按确切name查询为空；`workspaceName`对应的唯一staging目录已消失；配置work目录字节/文件数回到0。browserClosed之外，独立检查真实worker/browser PID均ESRCH。
- 成功artifact和browser evidence原本是**有意保留的产品输出**；测量记录其字节后由harness消费并删除，之后本轮artifact/evidence字节/文件数回到0。不是声称生产系统自动删除已验证版本。失败产物由生产runner删除。共享宿主全局进程/磁盘不用于断言，避免误归因其他并行测试的资源。
- 截图队列填满100项、阻塞真实队列的一个capture依赖；同时两次runNext返回同一执行promise，peakActive=1，101号请求明确QUEUE_FULL且未入队。终态淘汰释放一个槽位，其余排队项保留。此队列测量使用依赖替身，不能代替HTTP生成队列容量验收。

## API干扰测量

**当前T2证据以带时间屏障的修正轮为准。** 同伴在D22-A #75发现旧轮只等Running就查询，真实OOM发生在查询之后也可能通过；这一审查成立。以下旧40条原生成功样本保持原样，但OOM干扰结论撤回，不修改它们的PASSED/canonical字段。

真实API+新PostgreSQL的成功开发轮：baseline、CPU超时、真实OOM、负载后各10次GET（用户/应用列表各5），共40次均200，无业务重试；每个负载组开始前独立inspect确认故障容器正在运行。

| 阶段 | n | 最小ms | 最大ms |
| --- | ---: | ---: | ---: |
| baseline | 10 | 10.68 | 81.11 |
| CPU超时 | 10 | 10.76 | 52.52 |
| 96MiB真实OOM | 10 | 6.79 | 11.24 |
| 负载后 | 10 | 6.15 | 11.14 |

这些旧记录只能证明容器Running后API返回200，不能证明覆盖OOM压力。修正后的可信fault image在宿主释放前不开始分配，释放后再延迟500ms；实际Docker OOMKilled及cgroup oom_kill均确认后才进行10个GET，guardian在整个组结束后才获SIGUSR2退出。另有压力前负向对照、CPU真实子进程/用量屏障及每种故障清理后的直接查询。每条记录保留单调钟开始/结束与屏障关联，`api-evidence.mjs`独立核验因果顺序，旧记录及将GET挪至OOM前的损坏副本均被拒绝。

修正B轮80/80 HTTP200：实际CPU屏障后max6.5595ms，OOM确认后max5.7829ms；CPU、内存对照及内存实测故障清理后的查询各10个，另含20基线/收尾及10个压力前对照。该结论是确认OOM后仍可响应，不是分配器峰值期间的连续观测，也不推广为多实例/宿主全内存耗尽保证。

已读取A的#75精确候选9c5cf47、完成10/10独立专项及只读互审。本地A+B资源组合另80/80通过，API生产源码113个文件起止不变；组合D20全链实际native1，发布phase被即时读为UNKNOWN，尽管之后账本为SUCCEEDED。已保留原断言失败、SQL、PNG与trace，不把后来的终态回填为通过。资源组合与完整产品联调分别报告；部署机/公网模型容量仍需最后启用PR校准。

## 证据、失败与门禁

完整原始样本、机器、结果、隔离inspect、清理、源码SHA256及canonical标志在各 `report.json`；私有原日志位于 `.local-data/d22-b/`，公开副本及命令/退出码/日志hash汇总由export脚本生成。未提交开发轮保持canonical=false，不能当成某个旧提交的干净验收。门禁具体结果见 `docs/handoffs/D22-B.md`。

公开证据目录使用局部 `.gitattributes` 禁止JSON换行归一化；`evidence.test.mjs` 独立核验7份原始字节的SHA256与记录状态。实际在Windows新worktree中复现过CRLF导致的exit1；保留原始字节后同一测试exit0。不通过重写清单hash来接受变更后的样本。

已保留的失败：首次队列fixture根目录ENOENT（已显式创建）；首次API轮的共享fault标签在另一套件重建时导致旧image ID不存在，exitCode/oomKilled保持null（改为每轮独有标签固定ID，未重试失败业务）。该轮CPU下20个GET观测不被提升成整轮成功。无模型付费请求；开发agent token环境未提供实测计量，保持UNKNOWN。

cb04df4与a518d3b两个精确候选远端六项门禁均成功（前者API365/365）；本地独立runner原生1（244 pass/4 fail/1 cancel）、E2E原生1（67 pass/4 fail/4未运行）。本地额外聚合在API阶段运行32分钟后主动中断，保留原生1与中断原因，不报全绿；Windows路径校验热点只做只读诊断，未证实根因，未改API。宿主中断留下一个已退出构建容器及staging，经输入manifest与本轮journal匹配后人工精确回收；这不能替代生产崩溃reaper。具体文件、命令、失败及远端快照见交接记录，最终PR HEAD状态需独立读取。
