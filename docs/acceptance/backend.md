# D28-A 候选版本服务端独立验收

## 2026-11-03 最终增量复审：1fe1389技术通过（当前）

A已独立完成PR95候选 **1fe1389dee23efbb1b43c30f3ec1b8f546413087** 的增量复审，基线main2be，前一已审源码57d1acf。当前增量无阻塞技术发现；PR草稿/正式批准/合并状态以GitHub实时记录为准，本记录不冒称已经合并。用户已明确确认“历史事件留档不再阻塞”，原根因UNKNOWN保留、不写成修复。

- 需求增量8/9、代码故障3/3；TASK-03仍失败计入分母。四份原Maven日志各实际运行1项，原report重算0、22个REAL调用和原冻结集已独立核对；原通过的6需求及环境2/2按用户要求复用。生成源码/JAR在57到1fe不变。
- 新worker权限8/8、原加新预算控制20/20均原生0；API可读不可写、preview不可读。277包成员、258 Git源码及实际部署9项全部匹配；当前六CI精确1fe全success，API437/0fail/0error/0skip。
- 公网2站点文件/7平台文件独立GET字节匹配，私有回执404、匿名cover/ZIP401；原ZIP独立16成员验证0且与旧通过包相同，真实cover任务SUCCEEDED/attempts1、PNG1280×720/13505字节，原图及公开页已目检。
- 账本43条事件独立复算并链接A原revision32，原14记录不变；累计上界1.547654元（保留UNKNOWN0.4）、余额0.452346，实际账单UNKNOWN；A复审新增付费0。

M5技术验收通过；最终流程须保持另一人审批、当前main组合六门禁及无未解决讨论，PR95仍草稿时不能视为已合并。A在本分支只新增复审文档/校验工具/派生回执，不改变已部署1fe候选；后续若commit/base更新按规则重查并重新批准。生产provider仍deterministic-mock，与独立REAL质量报告分账。

认证HTTP额外复读因trace Cookie用途未显式授权被自动审批拒绝，未执行；B已有owner/跨用户/错误摘要通过原件按复用范围审计，A没有使用会话。当前复审依据不依赖口头确认。详细三类结论、限制、命令/退出/结果：`tests/release/api/D28-B-FINAL-REVIEW.md` 与 `evidence/d28-final-review/summary.json`。开发token各项及计量来源UNKNOWN，平台A新增付费0。以下所有旧HOLD均保留为历史快照，不作当前候选结论。


## 2026-11-03 真实模型阻塞跟进（当前；以下均保留为历史快照）

B交接的真实批次 `2026-11-03T07-32-26Z-real-ef4add12` 已由A独立下载原归档并核对1553成员全部SHA/长度；目录增量原件另34成员也全部匹配。原115个批次文件前后摘要不变，原 `node scripts/eval/report.mjs <original-batch> --check` 原生0，仅表示报告可复算。平台6/9；B目录断言受影响复验后行为6/9，未达8/9；代码故障2/3、环境故障2/2，仍 **HOLD**。

原SHOW-02/03在 `{"role","name":...}` 缺role值处严格拒绝；TASK-03的协议外type/response封装没有解包执行；FAULT-CODE-03第七次调用前已计费27492、输入预约22157、输出仅351，目录页仍缺，finish_reason=length，未到故障注入。原失败保持，不据原生进程0冒称成功。

最小跨模块修复已拆独立草稿 [PR96](https://github.com/Echo-love928/CodeLess/pull/96)，精确提交 `748f0f3fb5ce764abc3bb7f5883b75608fb514a3`，基线为B的8798010，目标B分支而非main。三份agent Java与两份prompt：共享原REPAIR工具规则因子化，在GENERATE首个请求起去重；完整合法JSON目标示例和明确的REPAIR根对象要求。计划/字面数据/验收点/源码/摘要、严格parser/闭合执行规则、原断言、预算与超时均未放宽；provider/runner/模板/公共契约/锁/CI/迁移未改。B须复审其变更后协调最终候选，旧0a7产物不能换标。

Java21原生Maven42/42、failure/error/skip均0；原第七请求投影可用输出351→2544，计划/源码/摘要保持。这不是完整4096或新真实效果通过证据。外层记录器打印时GBK失败1、Maven0和原日志/JUnit分别保留。旧c28六项CI已核验success；PR96新SHA须看自身检查，不继承。根分支本轮仅交接/证据，未在A启动争用B专用runner的全量Docker测试。

唯一账本只读revision32、链校验通过、绑定0a7；累计保守占用1.255074元（含未知0.4），余额0.744926，真实账单UNKNOWN。A仍冻结付费，本轮新增模型调用0；B作为唯一执行方须按实时status逐项预约/结算，不能预先保证四项均可覆盖，额度不足即停。新候选回归需维护原样本/批次追加审计，不得绕过重复拒绝、在原批次重试刷绿或重置账本。

T1新修复检查待独立确认，T2真实质量未达标、T3新候选未部署、M5继续HOLD；原历史文件事故也未被本轮关闭。后续需B复审最小差异→新同源成组封存/账本绑定→按预算受影响真实复评→达标后维护者切换与实际身份/URL/ZIP/cover验收。本轮无部署、批准或合并。新增私有源码/原请求/日志/JUnit回传被自动审批拒绝，命令未执行、native=null；B使用其已上传原归档与PR96代码即可复现，无需新私有出站。开发input/output/合计及计量来源UNKNOWN；平台新增付费请求0。证据 `tests/release/api/evidence/d28-model-protocol/`；完整修复说明在PR96的同目录 `D28-MODEL-PROTOCOL-FIX.md`。


## 2026-11-03 B五批原件已独立取回并分析（当前）

B交付的280文件（28844335字节）已由A独立取回并逐项核验，SHA/长度无差异；“B关机无法取得原件”已由本段更新。五个原批次分别保留，原API中断native=null不补0。只读解析器Windows/VPS各5/5通过，双方规范分析报告10236字节、SHA `02b4c0fe573c328b052fb38002d74a4755ed9d673dc6e8a16d20e0ac25e10c13`完全一致；原认证trace/日志不上传GitHub。

**新事实**：重下载原10秒监听中，7070.790ms用于等待按钮出现；export到原失败只观察2887.500ms，原HAR未有完整响应，不能称为“服务端10秒超时”。02全量日志的D19清理超时与稍后E2E清理超时已按原阶段分开；D19同次原生终止、拒绝栈/句柄仍未记录。73份中断JUnit316项/22失败、90份全量JUnit428项/2失败、c7两份JUnit7项/1失败均独立重算，不跨批拼成功。

**HOLD不变**：原未采集的代理完整日志、拒绝栈/句柄以及未输出JUnit明确缺失，不再要求B补造旧件；下一步为B专用runner上保持原断言/deadline的定向同次捕获，关联版本就绪/下载请求/代理/宿主与原生清理结果，机制确定后做最小修复。A原历史EPERM/ENOTEMPTY/CLEANUP_FAILED仍OPEN。本轮未改产品或B文件，未放宽任何检查。

A7b4a88b精确六CI已success；本轮新交接HEAD另看自身检查。没有最终新候选，未重封API/client/worker/镜像、重绑定账本或部署，未合并；付费请求/支出0，开发token计量UNKNOWN。操作、同次时间线和三类互审意见见 `tests/release/api/D28-B-ORIGINALS-REVIEW.md`，真实命令/退出/SHA见 `tests/release/api/evidence/d28-b-originals/`。

## 2026-11-03 原失败原件交付与后继候选准备（历史：B待传状态已更新）

结论仍 **HOLD**。B最新报告HEAD `a264cf11d17af7897019969a8b1aa3d65b11cfc9`，产品修复候选为 `7db2eaf9086c508d22785f7d1a8c329ba14bba93`；它不是旧00fd封存包。用户确认B电脑关机，先完成A独立部分。

- **原件实际可取**：A的历史EPERM、ENOTEMPTY完整日志、旧CLEANUP_FAILED CI API日志及来源共55成员，逐项核验并上传 `/srv/codeless-handoff/d28/20261103-a-diagnosis/a-original-failures.tar`，2416640字节，SHA256 `56a0f6bbe1ee4135c066dea0699848993eaf0f50c32aee5513a6ca6ab693f571`；服务器校验原生0。原始私有内容不进入GitHub。原D22报告本次才独立计算SHA，显式标记非旧回执锚定。
- **缺失不补造**：原EPERM只存message，原CLEANUP_FAILED断言前没有runner回执；同次拒绝栈/OS句柄不能事后恢复。原ENOTEMPTY临时根已清理。B的API中断、D19超时和7db重下载原件待其开机补传，当前只读其公开投影；根因仍null，没有猜测性产品修复或重跑全套求绿。
- **下一次取证**：新增宿主Node文件操作观察器（原参数/同一Error、不重试、内容不采集、调用/拒绝栈和单调时序/观察到的句柄、4MiB截断显式标记），本机3/3原生0。它不覆盖API白名单清理后的子进程，不能替代同次128MiB管理员ETW。原件收集保护本机/VPS各2/2原生0。
- **B修复只读复核**：A在隔离7db工作树离线锁定安装0，工作台14/14原生0，源码/HEAD未变；不替代完整E2E或失败后重下载。未触碰B指定Docker runner。
- **预算当前已更新事实**：只读核验唯一账本revision2、B已对账历史0、无entries/active、可花2元、事件链通过；仍绑定00fd，A冻结付费。本轮没有改写数据库或现用控制器。
- **重绑定工具已备妥未启用**：新增同一账本CAS追加候选绑定，核对实际成组包/六组件和新SHA六项success，保留旧支出、UNKNOWN占用、样本/事件历史，拒绝活跃进程、旧revision、篡改/换标和neutral。本机/VPS各10/10原生0；新版本仅放受控next-tools目录，兼容只读查询0且真实SQLite字节未变。

最终候选未确定，尚未重封API/client/worker/镜像、绑定新候选或切换生产；这些按“根因最小修复及受影响重测→冻结成组封存→B复核→同账本追加绑定→维护者切换→独立实物核验”顺序执行。四阶段/ci-gate在本轮新交接HEAD须看其精确CI，不继承191/7db的结果；本轮未另跑本机四阶段，因未形成根因修复候选且B独占runner。T2/T3/M5未通过，T4仅已执行部分有原始证据。

详细操作/同次证据清单：`tests/release/api/D28-JOINT-DIAGNOSIS.md`；命令、原生退出与SHA：`tests/release/api/evidence/d28-diagnosis/`。开发input/output/total和计量来源UNKNOWN；平台本轮付费请求0、支出0，fixture不调用模型。未自批、合并、改main或生产。

## 2026-11-02 原包及共享预算已转入受控远端目录（当前）

已按用户本次明确交付授权，将**原统一包**复制到既有VPS的独立SSH/SFTP目录 `/srv/codeless-handoff/d28/20261102-cny2`（root:0700，不在生产web/生成容器挂载目录）。没有重建/重新打包、开HTTP端口或切换生产。包 `unified-00fd-kit.tar` 为167813120字节，服务器独立SHA256仍为 `52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206`，文件0440；控件/原清单/工具也逐项核对原字节。README小文件与首次校验会话的传输中断保留，仅补小文件后单会话完成校验。

A额外全量回读在600秒时限内超时（父进程1，scp终态未知），已读59146240字节的前缀SHA与原包一致；不冒称完整回读成功或B已完成下载。服务器已对完整原包计算SHA成功，B可用无该诊断时限的scp或SFTP `reget`续传后验证完整SHA；说明位于远端 `DOWNLOAD-NOTE.md`。

B使用自己的D27既有VPS SSH身份（无需A的F盘或私钥路径）：

```sh
scp root@23.136.172.128:/srv/codeless-handoff/d28/20261102-cny2/unified-00fd-kit.tar ./unified-00fd-kit.tar
scp root@23.136.172.128:/srv/codeless-handoff/d28/20261102-cny2/ACCESS.json ./ACCESS.json
ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py status
```

`ACCESS.json`给出B解包后的组件路径和显式校验命令；原selection中的A路径仅作来源证明，不修改原manifest来迁就路径。操作手册 `tests/release/api/D28-B-CONTROLLED-HANDOFF.md` 与远端README相同。

**共同预算只有一份权威账本**：远端 `budget-ledger.sqlite3`，快照 `budget-ledger.json`；ledgerId `e5762985-8989-410e-9d15-b58a83d7451e`，初始revision1。用户本轮累计上限2元，A已确认支出0并冻结后续付费启动，执行方交B。B先前用量未知，未由A猜成0：B用机器调用/活跃任务清单完成claim-b前，spendable=0；remainingAfterKnownExposure=2只是扣除已知占用后的上界。任何已发生/未知B用量先对账，不重置或另开2元账本。

共享控制器以SQLite事务串行预约，一次仅一个活跃任务，按原50000tokens/峰值输出价先留0.4元；失败调用计费，未知保留0.4元，未确认进程结束不释放，重复样本/超额拒绝。事件链校验、只读快照与去敏用量投影均已实现；本机6/6、VPS6/6原生0，均为财务fixture，不发模型调用。A新SSH读取会话已成功查询真实账本及事件链；没有冒称已在B独立主机执行其SSH身份。

证据 `tests/release/api/evidence/d28-transfer/transfer.json`、`server-delivery.json`、`ledger-initial-readback.json`；B须从实时status取余额，不依赖Git中的静态快照。此处只关闭“B取不到原包/共同账本”的A侧交付缺口，历史根因、新部署、真实质量、生产cover及M5仍HOLD；未批准、未合并。

## 2026-11-02 第二次复审：统一候选与原阻塞闭环（当前）

**结论仍HOLD；本轮没有声称修复历史EPERM/CLEANUP_FAILED，也没有部署或付费模型调用。** B已在PR95将A的a16ac25与B的80205692合为 **`00fd43333f35c5cb0cce425721fdce9cd1d0f956`**。本轮据此准备同源候选，独立worktree为 `.local-data/d28-a/unified-00fd433`，没有修改B文件或main。主分支仍2be。统一候选清单 `tests/release/api/d28-unified-candidate.json` 固定该源码/tree、API/JAR、client、worker及独立镜像；这是验收候选，不是根因修复或发布批准。

本轮实际完成：

- **精确00fd门禁六success**：[run41424603409](https://github.com/Echo-love928/CodeLess/actions/runs/41424603409)，`d28_ci_snapshot.py --head 00fd43333f35c5cb0cce425721fdce9cd1d0f956 --run 41424603409` 退出0；原日志私存，`evidence/d28-fix/ci-00fd433-2026-11-02T10-14-06.654200+00-00/result.json`。不继承a16或旧61成功，后续A交接HEAD自身检查另看PR。
- **同源封存**：API manifest `3d0e52103de6bf1614bc751302566d51e6364459054fdbb4e6030cb8144486a9`，JAR仍 `d2c1bc7...`；client manifest `db83cd46801ab1c587cdb85e022533ec14735a6efe3b5301682cabc4f04f6fbe`；独立镜像 `sha256:e73196cae90d4f114cc1dd0c3e285524c3449a1b193e2befd49f8dcf05ccd445`，revision标签00fd、归档内容与配置摘要已核对。258个API源文件逐字节核对Git blob、JAR五迁移一致，API/client共享113文件全部相同。没有改共享策略tag或推送镜像。
- **迁移/恢复**：新00fd JAR的空库/合成V4 dump→源cluster销毁→新cluster restore→迁移/权限等 **40项原生0**。另找回A机原D23机密备份，原manifest/dump摘要匹配，恢复至全新PG，用新候选JAR验证旧版本/源码/导出及权限 **22项原生0**；原备份字节不变，cleanupErrors=[]。这22项是真实历史生成数据（原模型mock），不是生产Linux绝对路径预览或新真实模型效果证明。原D23备份没有上传。
- **新镜像真实回归**：封存API源码配明确e731镜像ID，真实Docker/Vue/Chromium正常路径通过；歧义目标按原要求ACTION_FAILED、worker exit1，两个build均0，容器/工作区/浏览器清理成功。回执在断言前保存。`evidence/d28-followup/unified-runtime.json` 记录两个场景、命令/原生0/摘要；不声称复现旧CLEANUP_FAILED。
- **工具最小改动**：仅A允许范围内给 `existing_demo.py` 增加显式候选参数、`d28_attest.py` 增加候选/新输出参数；原默认和断言不变，新输出拒绝覆盖。`d28_live_identity.py`增加显式新候选/实际已安装manifest路径比较。8项原控制通过，路径越界/覆盖负对照按预期非零；新产物及原报告保持。

尚未闭环的具体证据与下一步：

1. **EPERM/CLEANUP_FAILED仍OPEN**。46份EPERM原JUnit/场景/journal及676107字节原CI API日志均复算匹配，47文件私有取证包SHA `2dcc9613a2b03c16cb290d330a6819b14f8aa7fb819632682a7db33b9fbf5488`，未上传。原EPERM仅存error.message而未存stack；原CLEANUP_FAILED在断言后才落报告，原同次runner/JUnit/句柄与拒绝栈缺失。当前GET旧run artifacts总数0，不能据此断言其历史上从未存在。`evidence/d28-followup/original-failure-chain.json`逐项列可用与缺失，rootCause=null；无法从新428/428倒推历史占用者。
2. **有界带栈诊断受阻**。准备的 `d28_stack_trace.ps1` 仅启用独有命名的Kernel-File用户provider、stack、128MiB循环文件、7分钟截止；不改注册表或全局kernel logger。本次Windows UAC明确返回“operation canceled by user”，追踪未启动，两个原定向API用例没有执行；父记录器退出1、Maven退出null、JUnit=[]，不重启UAC或补0。脚本只有语法检查，实际stack捕获尚未验证。后续需原保留现场，或在用户再次允许且具备管理员会话时作一次有目标的新失败捕获；未确定机制前不写猜测性产品修复或添加重试。
3. **新候选部署证明仍未通过**。已授权SSH只读将现部署与00fd清单比较，原生 **1**：运行JAR/worker/258源码/7web字节相同，但deployed记录、封存manifest和实际策略镜像仍61，三项失败。`evidence/d28-fix/live-identity-2026-11-02T10-25-19.254660+00-00.json`保留真实不匹配；旧61核验继续保留，不能当00fd已部署。根因/发布阻塞关闭后由部署维护者成组切换，再提供实际manifest路径，运行同一只读新候选比较入口。
4. **真实质量/生产cover仍NOT_RUN**。现有主机模型凭据已配置，本轮不再称缺密钥；用户已明确授权本轮最多 **2元，额度不足即停止**，账号CNY/足额只读核验通过，证明仅私存。但原免凭据TLS前置12次中11次取得预期证书，第12次certs=0/subjectNONE/issuerNONE，原命令退出1；JVM探针和付费批次未到达。`evidence/d28-followup/real-admission.json`及原字节TLS观测保留；没有放宽证书门禁或重复求绿，新模型请求/支出0，本轮2元授权保留。`d28-real-acceptance-plan.json`给出00fd、原14样本/冻结运行时上限/无外层重试和当前官方峰值计价上界；旧fb79财务sidecar固定旧候选，不能借用其批准。需eval维护者绑定新候选并协调独占runner窗口；生产cover另需对应维护者完成新部署后的真实capture账本与已服务截图字节验收，不以本地截图代替。

汇总 `tests/release/api/evidence/d28-followup/summary.json` 关联每份回执及SHA。T1本轮统一候选必需检查通过；T2仍未证明严重缺陷零；T3本轮迁移/恢复与包同源通过，但新部署比较失败；T4已执行部分有原始结果、完整验收仍不成立。M5保持HOLD。开发input/output/total与计量来源UNKNOWN；本轮付费模型请求0、合成累计请求/token UNKNOWN，分账记录。未批准、未合并。

## 2026-11-02 B复审后的当前修复状态

PR94原精确HEAD `438c0f5` 的远端结果已取回：static/API/runner/infra success，**E2E和ci-gate failure**，[run41321844346](https://github.com/Echo-love928/CodeLess/actions/runs/41321844346)。79 passed、1 did not run、2 suite errors，原120秒suite/teardown截止；`evidence/d28-fix/ci-438c0f5-failure.json`及原日志/trace摘要保留。下面原“PENDING”仅是发布时快照，不再作为当前状态。

最小范围扩展仅 `apps/web/playwright.config.ts`：D08原生验收另列首项目，其余79项仍用原Chromium；原80个file/title身份逐项相同、无重复/遗漏，globalTimeout仍120000、retries仍0，原测试断言没有修改。原trace显示D08约第78秒才开始而自身预算115秒。**修复提交 `4eb9595f513696abf95ace3dc4bf5670b0cbeec3` 六项必需检查已全部success**，[run41411371862](https://github.com/Echo-love928/CodeLess/actions/runs/41411371862)：E2E80通过且完整平台browserExit0，API428/428、runner285/285、static64+212、infra和ci-gate通过。GET取证入口 `d28_ci_snapshot.py --head <完整SHA> --run 41411371862` 原生0；原日志摘要、精确head绑定及六项检查见 `evidence/d28-fix/ci-4eb9595-2026-11-02T08-29-39.428736+00-00/result.json`。GitHub不提供的子进程退出仍null。公共契约、锁、CI、迁移与产品运行代码均未变；B仅需注意D08项目名/trace路径变化。后续交接提交自身检查必须另查，不继承4eb的success。

`d28_record.py`改为探测显式 `--java-home`、标准JAVA_HOME_21_X64/JAVA_HOME/PATH并验证Java21；错误major或探测失败拒绝，不再依赖A机器路径。任务私有pnpm shim由当前运行生成。新增4项可移植性负对照与原4项证据接纳测试均通过；假版本探针只证明选择策略，实际完整API仍使用真实Java21/PG/Docker/Chromium。

旧缺件结论已更新：PR95@`80205692`已只读审查，23处Git blob证据引用SHA全部匹配；B原gh获取方式与direct API字节两组证据已核对，不再将其当未解释摘要阻塞。见 `evidence/d28-fix/peer95-review.json`，未冒称A独立执行了gh或重跑B私有浏览器链。PR95自身全门禁失败仍保留、未批准。

用户提供既有SSH密钥目录后，当前部署61已独立**只读**取证9项通过：运行JAR的打开fd摘要、worker及其启动绑定、镜像ID/revision、258源码与7个Web文件、agent/export路径均匹配选定清单。`live-identity-2026-11-02T07-51-38.317154+00-00.json` native0；没有部署新候选、重启或改服务器。首次测量用/proc整秒btime误判约1秒，失败回执保留；改用CLOCK_BOOTTIME的同次采样纠正测量，未改部署字节。当前61身份已证，不再声称缺访问；新候选是否部署仍单列false。

原Windows完整API首次复现遇Docker Desktop未运行，在Testcontainers前置失败，未触发BARE；原记录保留，不算EPERM复现。既有Docker29.9.2恢复后，在原Windows干净438提交执行原 `corepack pnpm verify:api` **原生0，428/428、failure0/error0/skip0**，90份本次JUnit及日志摘要逐项复算无差异，sourceBytesUnchanged/headUnchanged均true。用户授权的本卡独有128MiB管理员文件元数据追踪覆盖BARE现场。最终命令回执为 `evidence/d28-fix/2026-11-02T07-54-42.103368+00-00-windows-api/command.json`。

管理员追踪start/stop均0，128MiB ETL仅私存；筛选1049017个事件，保留511个目标事件。`evidence/d28-fix/windows-file-trace.json`记录同一产物目录一次底层rename的0xc0000022随后不到1ms另一次rename成功；本次BARE两次build均0、按原断言得到NO_PROGRESS，**没有复现Node层EPERM**。同时出现的进程访问不能证明历史占用者；ShareAccess7允许DELETE，不能据此归因杀软。循环记录可能覆盖早期事件，无拒绝堆栈，原历史actor/mechanism仍UNKNOWN。复现及解码均不改生产动作/重试；不增加无计划第三轮全量重跑。

| 当前判据 | 结论 |
| --- | --- |
| T1 | 本次4eb远端六项success、原Windows438完整API428/428原生0均已独立取证，无skip/neutral代替；原2be失败保留并作为T2历史事故继续阻塞，不能据新绿宣称根因关闭 |
| T2 | **未通过**；原EPERM、ENOTEMPTY、CLEANUP_FAILED及真实模型质量/生产cover仍OPEN/HOLD，不能宣称严重缺陷零 |
| T3 | 现部署61的API/worker/镜像/源码已独立证明；新候选未部署，不能宣称新候选的部署验收通过 |
| T4 | 已完成结论均有提交/命令/退出或GitHub状态/结果/SHA；PR95与原日志获取方法已更新，未执行与未知仍明确保留 |
| M5 / 合并 | **HOLD**；无另一人批准，未合并。最终HEAD检查见PR；历史严重阻塞关闭前不得放行 |

后续最小交接：API/runner维护者需对历史产物rename/终态淘汰/cleanup失败取得同一次失败的句柄生命周期和拒绝栈，形成最小修复及新候选；本次成功现场只能帮助缩小观测范围，不能替代历史事故闭环。真实模型及生产cover验收另需对应维护者提供授权范围和原始结果，不开展未授权付费调用或生产写入。

## 以下为初始交付与原失败快照（保留，不覆盖当前增量）

结论：**HOLD；不得据本记录合并或宣布 M5 通过。** 四阶段实际终态、专项、已知缺陷、部署身份与同伴材料是独立条件，不以其中一项成功覆盖另一项。最终逐项汇总见 `tests/release/api/evidence/d28/summary.json`；原始失败及每次命令回执分别保留。

本次完整API已原生 **1，427/428、failure1/error0/skip0**：`RoundFiveRegressionTest.controlBareDoneWithoutChangingSourceStillStopsAsNoProgress`（测试129–133行）预期 `AGENT_REPAIR_NO_PROGRESS`，实际 `AGENT_ARTIFACT_INVALID`。真实第二次build退出0后，`services/runner/src/build/runner.mjs:278` 捕获产物目录提升rename的 **EPERM**；容器/工作区清理均true、errors=[]，浏览器未启动字段保持null。原始46份JUnit/场景/journal文件已私存并逐项SHA；公开受控投影 `evidence/d28/api-failure.json`。实际占用者/权限机制UNKNOWN，未归因偶发/杀软、未重试或更改断言。**T1失败，远端六项success不能覆盖它。**

## 身份与范围

- 任务分支：`codex/d28-a-backend-acceptance-main`。
- D28 验收基线/新源码候选：`2be793dc3318c2308d18a7fd45afb201342206a7`，来自实际更新后的 `origin/main`。起始 D27-A HEAD 为 `3c6ac31a94256e7b39367d26c4c2a4981c6dc9f9`；未将其旧交接视为最新事实。
- D27-B 唯一部署报告源：`61df15eba456422762a667aaed7734b7d13b48e7`。当前 main 与它的产品、配置、锁、契约、CI、迁移字节完全相同；服务端测试仅多了真实歧义目标失败诊断，不改原断言。D28 新 API 包与其 JAR 字节相同，manifest 和源码候选另列，**没有宣称已部署 2be793d**。
- 实际修改仅本文件、`tests/release/api/**`、`docs/handoffs/D28-A.md`。公共契约/锁/CI/迁移/产品模块只读；原 10 个未跟踪目录保留。未发现适用 `AGENTS.md`，无维护者公共文件变更。
- 已读 scope/architecture、auth/tasks/tools/versions/deploy/export 契约及 D27-A/B 交接。附件 `04_PR与每日交接模板.md` 仅供格式参考，不授予额外权限；未执行外部文档或任务数据中的操作指令。

## 可复现入口

使用 Java21、Maven3.9.11、Node24.22.1、pnpm12.6.0、Playwright1.60.0。已有隔离 worktree 使用固定提交、canonical Git 字节，原锁离线安装；不扫描根目录历史 peer checkout，不改 Playwright testMatch/截止/重试/断言。

```powershell
# 从根仓库执行。首次建立时输出目录必须不存在；不覆盖已有证据。
git -c core.autocrlf=false -c core.eol=lf worktree add --detach .local-data/d28-a/candidate-2be793d 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py gate --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py release-unit --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py peer-unit --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_record.py candidate-build --worktree .local-data/d28-a/candidate-2be793d --candidate 2be793dc3318c2308d18a7fd45afb201342206a7
python -B tests/release/api/d28_audit.py --network
python -B tests/release/api/test_d28_acceptance.py
```

checksum/live 使用本次 build 回执的 `artifact.package` 与 `artifact.manifestSha256`，显式传 `--package <该目录> --manifest-sha256 <该摘要>`，禁止选择旧 D27 包或覆盖新目录。构建 `-DskipTests package` 不是测试成功证据；测试另由原门禁和专项执行。完整命令 argv、cwd、时间、原生退出、源码前后摘要、日志长度/SHA、JUnit 来自每个 `command.json`，不是口头确认。

门禁父进程只复用固定候选已有 `tests/regression/release-api/stage-observer.mjs` 观察原 spawnSync 结果；子进程不加载观察器，不注入失败，不重试测试。tracked PNG 新结果私存后恢复原字节，其余源码不恢复或隐瞒差异；任何源码/HEAD 变化导致记录器失败。JUnit 仅收集本次开始后写出的报告，避免旧绿报告混入。

## 子项和测试判据

| 项目 | 独立验收范围与结论 |
| --- | --- |
| D28-A-01 | 原四阶段总门禁；权限矩阵、预算、取消、恢复与不可变版本由本次 API JUnit 场景关联。新封存 JAR 另测空库/迁移/恢复/权限/坏摘要。最终 native 和计数见 summary，不预填成功 |
| D28-A-02 | D27-B 最终报告、Git blob、清单外部摘要与 GitHub 精确 HEAD 已独立复核；D28-B 材料未发现，完整同日互审阻塞。详细三类结论见同目录 `peer-review.md` |
| D28-A-03 | 本次命令与候选、退出、结果、原日志/报告摘要关联，Git blob 原字节核验；未知仍为 null/BLOCKED |
| D28-A-04 | 新main形成新API候选后完整实测失败；当前2be继续HOLD，无已证修复候选。已封存EPERM现场并交API/runner维护者，需要原现场占用/权限追踪、最小修复后新身份与受影响重测；本卡不跨模块试改、不重跑求绿。历史268/2d/6d/51及旧失败保留。公开URLError和沙盒EPERM仅按已证环境原因重查受影响范围 |
| T1 | **FAILED**，当前完整API native1。Windows本地四阶段与远端Linux/infra分账；旧61或当前2be远端success不覆盖本机427/428，更不继承给最终交接提交 |
| T2 | **未通过**：既有严重发布/质量阻塞未归零，原 ENOTEMPTY 与 CLEANUP_FAILED 原因 UNKNOWN。新测试成功也不关闭历史事故；详见 D27-B 当前 unresolved 和 `docs/release-blockers.md` |
| T3 | 源码/封存 API/清单可独立验证，B 部署记录同源关系已复核；当前受保护 API/worker/容器/镜像身份未由本机再次核验，2be 新候选未部署。完整“版本/部署/源码哈希一致”仍 BLOCKED |
| T4 | 已执行部分全部由真实回执、JUnit、Git blob 和只读 GitHub 原始日志/元数据支持，无口头成功。B私有包/D28-B未到位；61的static/E2E原日志摘要匹配，API/runner与B声明摘要不同、原因UNKNOWN，保持BLOCKED，不归一化放行 |

## 版本与部署边界

D27-B 的 API/client manifest Git blob SHA 分别为 `e488c594cd32ac3bcf7b76faffba7810bc400a7f9c8bd8daa19340ae76a7246c` / `676635224f6e6dc28e0d8794daf34c87da6e3773b265cc0ee93485e38dee943b`。258 源文件逐一匹配 `gitBlob`、SHA256 和当前候选原字节；两个清单与包外 selected 摘要严格相同，无换行归一化。worker Git 源摘要 `311ed218b65e7a6bf5ceb309b8c7ff6c9f8f8fc73a6671faa3d5c50ae475cbaa` 匹配报告；这属于**报告与源码一致性**，不是当前服务器实物复核。

本次新 API 源码 `2be793d`、manifest `54d2cc55eb579073ca9570620a56ebe45598166ac7e01fd45121399a0377f453`、JAR `d2c1bc7bccd9df9eec194fde509fa012f5c41eb3a7703aad669aaa447e067446`。259 项文件，独立 Git 构建/未借用旧 target。B 的成组包/镜像包只在其主机，A 未收到并未谎称重算其归档字节；本卡不部署、不操作生产 SSH、旧数据库或发布入口。

模型明确 deterministic-mock（预算测试还有明确标记的 loopback provider fixture）；生成后的 PG、Docker/Vue 构建、Chromium 使用真实执行。新付费模型请求 0，合成调用/token 累计 UNKNOWN。真实模型质量、生产 cover 与历史失败不因此解除 HOLD。

任务恢复的 `ProcessRestartRecoveryTest` 真实启动/强杀/重启API进程与PostgreSQL，stage/hosting适配器是明确recording fixture，只证明恢复语义，不单独证明模型/公开托管质量。构建、浏览器和发布读取由其他实际用例分别覆盖；summary保留这些用例名称与原XML摘要。

最终原四阶段：**static0 / API1（427/428、error0/skip0） / runner0（285/285） / E2E0（80/80+完整平台browserExit0） / ci-gate1**。四阶段原命令均实际执行，无重试。90份本次JUnit及日志摘要全部复算一致，源码/HEAD前后相同；summary退出1/HOLD，provenanceMismatches=[]。精确2be远端六success独立记录，不覆盖本机失败。

交付为 [草稿PR94](https://github.com/Echo-love928/CodeLess/pull/94)，新PR当前HEAD检查另行运行，未等待/未继承旧结果。summary的 `NOT_RUN_LOCAL_DRAFT` 是其生成时的发布前快照；当前发布状态看 `publication.json`。整体仍HOLD，未批准/合并。

## 失败、新候选及合并条件

代码、base 或候选集合变化后必须新身份与受影响重测，不手改 report.success、不用历史成功替换失败。若有产品修复，交对应维护者最小 PR；本卡不跨模块修权限、runner、CI 或预算。所有结果、严重问题、当前精确 SHA 的六项远端检查、最新 main、未解决讨论及另一位成员批准同时满足后才可考虑合并。当前未批准、未合并。

开发 agent input/output/total：UNKNOWN/UNKNOWN/UNKNOWN，计量来源 UNKNOWN；未把 60,000 预算或上下文容量写成实耗，无法声称实测 70%。本次运行时用量另列，不合入开发 token。
