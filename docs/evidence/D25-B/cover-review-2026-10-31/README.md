# D25-B：PR86生产cover增量独立验收，HOLD

固定交付 **54f347f7da3c39311003f682022c955a6769b76e**，生产实现 **45650b16981b04b6d65742befea8793b21f7a229**，基线 **380811d5270a72706fad0b1a74b7ffab8b97735a**（PR84）。B在独立克隆、原始源码无改动的检出上复跑；实现到交付的差异只含文档/证据。**接受本轮接线、公共GET/UI兼容性及确定性保护回归，未发现新增代码阻塞；总质量继续HOLD，不批准合并。**

本轮没有启动A的捕获、付费生成/编辑或VPS部署；涉及真实原运行时的检查仅审查A去秘密证据。B独立测试使用隔离PostgreSQL、真实Docker/Vue/Chromium及明确mock，不能计入REAL质量。原fb79六编辑6/6和九需求6/9仍绑定其原候选，不转移成绩给45650b1。

## 阻塞问题

1. **TASK-01生产cover仍失败、根因UNKNOWN。** A `evals/results/D25-A/production-cover-2026-10-31/controlled-public-fixed/index.json:164` 的EDIT-06绑定原版本 `c7abe20b-f45d-4aef-baaf-071f09cbc34a`、`entryPath=/tasks`、FAILED/CAPTURE_FAILED、attempts=2、imageDigest/imageBytes=null；同文件229行的2/3经B独立复算一致，不能改为3/3。A采集native1按其README保留；原JSON未包含进程退出字段，B复算结果 `recordedExitCode=null` 保持未知，不伪造独立测得的原进程退出码。B一致性复算命令本身native0只表示证据一致。
2. **目标解析成功不解除捕获失败。** A `dns-probes.json:4` 记录新增截图尝试0，两次targetResolved仅覆盖本地回执/绑定/解析阶段，没有证明当时TLS/JS/CSS、浏览器启动、页面错误、截图和清理阶段均通过。失败时底层细节未采集，不能追认为瞬态DNS错误或已修复。最小只读取证方案见 [TASK-01-diagnostics.md](TASK-01-diagnostics.md)，本轮未启动新诊断捕获。
3. **生成质量与部署证明边界不变。** 原九需求6/9、故障及原13/14不完整保留；PR84及本候选生成REAL NOT_EVALUATED，受控非法Vue编辑不是自然FAILED。`runtime-retention.json:27` 为vpsDeployed=false；本机新API接通不等于VPS安装/启用。B直接公网DNS复核仍未解除。本轮没有宣称再次完成直接公网访问。

## 建议

- A保持原API61997、cover API61998、原DB/模型账本、不可变发布、旧成功图片以及TASK-01两次FAILED终态；不删除锁/inflight/quarantine/cursor，不改失败次数，不导入旧导出覆盖新结果。B接受源码接线不构成清理原证据的确认。
- 先按诊断清单补取已有日志与只读资产证据。确需新worker诊断时，另行明确候选、目标、隔离输出和次数；不复位原FAILED，不启动新付费模型调用或VPS部署。本轮只提出方案。
- 日后实际启用时提供Node可执行文件的真实绝对路径。B的NVM路径 `E:/nodejs` 是符号链接，触发预期拒绝；同版本 `E:/nvm/v24.22.1` 通过。可改善配置错误的运维定位信息，但不应放宽路径检查。
- A原始完整门禁日志仍私存；B核对公开15条receipt及summary的状态/SHA关联，不能独立验证未收到的原始日志字节。若需进一步复算A全量419/278/75，补充去秘密的原生终态/JUnit摘要及摘要基准即可，无需转交SQL、会话或密钥。B本轮没有重跑全部门禁。

## 已核验内容

| 核验 | 精确位置与结论 | B原生结果及证据 |
| --- | --- | --- |
| 交付冻结 | `git diff --name-only 45650b1 54f347f`只有docs/与evals/results/；生产、契约、测试字节未在交付提交改变 | native0；`evidence-check.json/deliveryOnlyDocumentationAndEvidence` |
| 公开清单及旧失败 | 按A `publication-audit-checkpoint.json` 对最终HEAD的87个Git blob逐字节校验；15条receipt及gate runs关联一致；旧首轮1/3、Int/Long隔离、编译失败、HTTP6/7、runner277/278/native1均保留 | `node check-evidence.mjs <A绝对路径> <新输出>` native0；`evidence-check.json`。A完整raw log SHA未由B独立验证 |
| 真实PNG/权限 | 新图片SHOW-01 36233字节、SHOW-02 26988字节，SHA/1280×720/版本/制品绑定一致，经B人工查看均为功能页；固定分母3，成功2；匿名401、跨USER/ADMIN404合计18/18；TASK-01无图片 | `evidence-check.json/runs`、`EDIT-04-cover.png`、`EDIT-05-cover.png`；A原 `controlled-public-fixed/` |
| Java专项 | 首轮18项中15pass、1failure、2error，native1；三项都在NVM符号链接路径被拒绝。保留失败后仅用同版本真实Node路径重查NodeCoverGatewayTest，3/3、native0。共18个不同用例均完成核验，**不冒称B首轮18/18/native0** | `verification.json/commands`、`initialGatewayJUnit`、`junit`，`java.summary.log`、`java-canonical-node.summary.log`；完整原始日志与XML在B本地保留 |
| 原生授权与入口 | `CoverService.java:23`先owner查询，再绑定同版本/task/build/report/digest；`CoverEntryProof.java:15`以唯一原生draft/runner验证、全部冻结动作PASSED推导唯一enum入口，缺少/歧义不猜根路径 | Java Entry4/4、HTTP7/7均通过；纯只读证据与隔离HTTP测试分账 |
| 两个GET/图片拒绝 | `CoverStore.java:53、80、87`校验完整绑定、摘要、PNG头/尺寸/6MiB；旧缺entryPath仅代表/，不能重标/tasks；错摘要404、损坏503；GET不创建job，不重跑FAILED | Store4/4、HTTP对应断言通过；`verification.json/junit` |
| 协调器/中断隔离 | `CoverCoordinator.java:22、50、67、84`持久OS锁、inflight/游标/quarantine、独立执行器；未知中断停止，旧成功可读；数字计数经JSON同路径规范化后比较，未放宽任意字段比较 | HTTP协调器/IntNode-LongNode回归通过；Node中断/旧FAILED持久化/绑定变化反例通过 |
| Node/契约 | `gateway.mjs:23、33、36`封闭输入、不接受调用方DNS/路径/命令；45秒外限，阶段≤12秒、2次、100条、资产3秒保留；旧RUNNING/RETRYING人工恢复 | `node-infra.log` native0、15/15（新Node10＋契约5） |
| 原网络隔离 | `network.mjs:36`只把固定index入口映射到可信enum路径，仍公网地址固定、TLS、清单字节摘要、重定向/未知资源拒绝；`worker.mjs:46、62`固定主导航及代理隔离 | `screenshot-old.log` native0、7/7；真实Chromium夹具，包含私网/metadata/页面自选请求阻断及worker强制回收 |
| 敏感环境与截止 | `NodeCoverGateway.java:21、34`清空环境后仅允许系统/路径/捕获配置，无模型密钥/DB密码/会话/NODE_OPTIONS；固定二进制和脚本，无shell；capture子层继续原白名单 | canonical Node专项3/3：环境键、重复/尾数据/非零输出、硬截止和子进程终止通过 |
| 默认关闭 | `application.yml:25` false；CoverConfiguration/Controller都受同开关控制；A `default-off.json`为正常登录200、两GET404、无队列/无resolver，未部署VPS | B源码审查＋A证据核对；本轮未将A默认关闭进程检查说成B独立启动 |
| UI/公共契约 | `cover-api.ts:12`从已验证owner publication URL及可信enum派生功能链接；缺entryPath仅历史根。`DeploymentCover.vue:30、36`失败占位/隐藏功能链接，原发布地址保留。契约只新增两个owner GET，无公共捕获写入 | `ui.log` native0、15/15；契约5/5包括schema负例；默认关闭404仍走原不可用展示 |
| 受控失败保护 | B隔离应用真实非法Vue构建exit2，编辑FAILED后旧latestReady/PUBLISHED/封面仍可读；mock账本5。没有原六项任务重跑 | `b-controlled-failure.json`；HTTP7项中的受控失败用例通过；naturalFailedEdit=false |
| 原运行时账本 | A门禁后26→26、latestReady/publication行不变；TASK-01 FAILED/2/null保留 | `evidence-check.json/runtimeRetention`，属于A原机证据审查，不是B数据库在线复查 |
| 最终HEAD CI | 本次gh只读查询HEAD=54f347f，static/api/runner/infra/e2e/ci-gate全部SUCCESS | `pr86-ci.json`；没有继承45650b1的success |

以下路径均相对固定交付检出 `<A>`，Java21、Node24.22.1、真实Docker/锁定Chromium。B不修改A源码；本机克隆路径为 `.local-data/d25-cover-review`，运行后tracked tree为空。B命令记录/原始日志私存 `.local-data/d25-cover-independent/<标签>/`。新B报告提交的CI不继承PR86或B旧HEAD。

```powershell
# cwd=<A>；首轮NVM符号链接配置的native1必须保留
.\services\api\mvnw.cmd -B -ntp -f services/api/pom.xml '-Dtest=CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest,CoverHttpIntegrationTest' test
# 若Node为符号链接，只对NodeCoverGatewayTest使用同版本真实目录，勿改路径检查
# B配置修正后下面原生命令native0、3/3，前15项不重复跑
.\services\api\mvnw.cmd -B -ntp -f services/api/pom.xml '-Dtest=NodeCoverGatewayTest' test
node --test tests/infra/cover-entry.test.mjs tests/infra/cover-queue-binding.test.mjs tests/infra/cover-gateway.test.mjs tests/deploy/contracts.test.mjs
node --test tests/e2e/share/screenshot.acceptance.mjs
# cwd=<A>/apps/web；复用已锁定依赖，不更新锁文件
corepack pnpm exec vitest run src/features/deploy/DeploymentCover.test.ts src/features/deploy/cover-api.test.ts
# 公共证据复算，可从任意目录运行；只读Git/公开文件，写新的B输出目录
node <B报告绝对路径>/check-evidence.mjs <A绝对路径> <新输出绝对路径>
```

本轮没有需要A修改生产代码才能关闭的新增审查缺陷；仍需补完TASK-01真实cover及更高层质量/部署验收。未向A的PR发布评论或批准，未改main，未重置任何真实FAILED或当前环境。
