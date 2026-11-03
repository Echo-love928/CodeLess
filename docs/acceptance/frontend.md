## 受控材料接收与原包核验（2026-11-03）

## 2026-11-03 B 当前增量：本地完整门禁通过，M5 继续 HOLD

B 固定源码 `edded45dd40d30d1bc0d83186c3828b22eba4ce7`。本次三文件变更是 E2E 资源调度、下载测试同步和同次代理/进程取证；生产截图、服务端导出、契约、依赖锁及生产超时均未修改。此前 `7db2eaf` 的取消终态事件补读前端修复保留。源码在全部测试期间不变；后续报告提交不冒充已测试或已部署的产品源码。A 尚未交付新的统一封存包，本轮不部署、批准或合并，main 未改。

| 项目 | 定位、修复与证据边界 |
| --- | --- |
| D16 超时 | 原10-worker配置实际复现79pass/1fail。截图87.5ms已完成，Chromium close耗时12635ms，代理关闭约2ms且无活动/升级连接。`apps/web/playwright.config.ts` 保留D08早期独立lane，D09/D15/D16共用另一lane，另保留UI槽；同80项各一次、原120秒/零重试/断言保留。没有宣称找回历史OS拒绝栈或修改生产截图清理。 |
| Windows失败/未运行项 | 原失败、全native单lane导致79pass/1notrun、仅降到2workers仍全局超时、10e3在CI缺UI槽的失败均保留。最终CI实际3workers、Windows4workers，全80项通过；原完整platform后续阶段也实际通过，原verify:e2e整体native0。 |
| 失败后旧版本下载 | 原7db trace中7.07秒在等待按钮可用，export仅观察约2.89秒即被测试中断；原请求最终完成时间仍UNKNOWN。`d28-user-flow.spec.ts` 明确先就绪再起10秒下载事件计时，这是测试同步变化，不能称服务端性能修复，也不能称原组合计时语义不变。额外独立核算本轮4次就绪+下载总时长均<10秒；恢复后事件3712ms、就绪6183ms、合计9896ms，余量约104ms。下一候选必须重测此边界。 |
| 同次现场 | `d28-flow.mjs` 在清理前捕获本次proxy stdout/stderr及摘要，记录API/browser PID、exit/close、是否主动清理。浏览器自然退出0；API退出1发生在显式清理阶段，不能记作新的API中断。 |

最终源码原始 Windows 四阶段 `ci:gate` 整体native0，static/API/runner/E2E各自真实exit0、signal=null。API完整90份本批JUnit、428/428，failure/error/skip全0；runner285/285；E2E80/80并完成原full-platform链路。独立strict D28双用户链native0、canonical=true、cleanupErrors=[]；2应用、5任务、8真实构建、2发布、17次明确mock调用，双向16项跨资源404、过期版本/错误摘要409、真实离线/凭据恢复、失败保留可用版本、历史ZIP与错版本拒绝、12路由/视口实际验证。

追加平台390px全链路同源验证也已原生0：两个独立用户重复原登录→生成→修复→编辑→发布→下载及权限/恢复断言，11个平台检查点宽度390且无横向溢出。原480秒/总500秒/零重试不变；仅私有验收输入改变初始视口、等价导入路径并增加只读布局/截图断言，输入与SHA单列，不冒充原桌面测试输入未变。移动恢复重下载事件约781ms、就绪约1872ms；其两份ZIP/部署清单独立复算一致。原始390px可见trace帧确认工作台Ada组件可见可选、发布页Hedy内容可见；保留长页面嵌入区空白及导航过渡空白帧，不仅凭长页PNG判断渲染。详见同目录mobile.json。

两个用户的applicationId/versionId/sourceDigest/artifactDigest/publicationId、实际ZIP SHA与清单、部署清单及全部发布文件摘要逐项一致。地址均为本地HTTPS fixture，`productionPublicUrl=null`；当前结果不能充当公网版本/服务器API/worker/image/生产cover验收。生产仍以已知61历史身份记录，未以本地新版本替换。真实模型质量不在mock结论内，本轮不启动付费请求。

复现入口：锁定仓库Node/pnpm/Java与本机实际DOCKER_HOST后执行 `corepack pnpm ci:gate`；专项使用 `node tests/release/browser/d28-record.mjs flow`。旧10-worker复现须从a264配置另存等价绝对路径副本，并单独挂载只读D16相位观察器，不改主分支、断言、截止或重试。原件经受控渠道交接，认证trace/原日志不公开。证据见 `tests/release/browser/evidence/d28/resolution-20261103/`，公开引用由 `d28-evidence-integrity.mjs` 直接校验Git blob字节。

放行仍阻塞：历史EPERM/ENOTEMPTY/CLEANUP_FAILED和原API中断尚无完整同次根因证据；最终A+B统一候选须重新封存并绑定唯一预算，成组部署后独立核验公网URL/源码ZIP/部署清单与生成版本；真实质量、生产cover及双方增量复审未完成。最终报告HEAD另查精确六项检查，不继承源码SHA的绿灯。

**以下为历史采集记录，保留原失败/未知及旧提交结论；当前状态以上述增量和对应证据为准。**


已实际接收A@1915777交付的原统一包：167813120字节、完整SHA25652e49be4…一致，275/275成员路径、长度和摘要全部匹配；原镜像OCI索引到平台manifest、配置/层摘要链及源码revision00fd逐级复算通过，API/client原包校验器均原生0。未load/build/retag或部署。初次连接中断及私有校验器两处OCI解释错误保留在核验历史，最终原包字节未改。

配套受控材料已取得并完成本轮对账，6项独立财务控制fixture通过；访问配置、权威操作记录及详细对账仅保留在受控私有渠道。本轮未启动付费批次，也未对当前候选作付费准入。

关闭的是旧00fd原包实际交接及配套材料取得缺口。当前7db包含真实前端修复，仍需最终候选重新封存和双方复审，不能将旧包改标为新候选。历史文件/清理故障、WindowsD16/完整E2E、失败恢复后重下载超时、真实模型、新部署公网/ZIP同源及生产cover继续HOLD。未修改main、批准或合并。

公开核验摘要见 `tests/release/browser/evidence/d28/intake/`；原件及详细操作材料留私有。以下为此前候选的历史记录，旧“原件未取得”条目由本段更新，不代表当前仍缺件。

## 本轮修复与后继候选（2026-11-02）

当前代码候选 **7db2eaf9086c508d22785f7d1a8c329ba14bba93**，整体仍 HOLD。实际前端修复使旧00fd封存包成为历史材料；新候选需要重新成组封存和双方复审，不能将旧包/部署61或旧通过结果改标为新候选。

已关闭的具体代码缺陷：确认取消返回终态后，工作台原先只更新状态，最终事件仍等待旧SSE订阅的退避周期。本轮立即重建同任务事件补读，并用订阅代次排除旧回调；不重复取消/创建，不改原截止、断言或重试。新增回归在原代码1失败/13通过，修复后全部前端单元213/213；原事件/恢复/权限浏览器26/26，完整新候选E2E中的D06原断言也通过。跨模块范围仅 `apps/web/src/features/workbench/use-workbench-task.ts` 和对应测试，已向A说明必要性、影响和新候选重封存：[交接](https://github.com/Echo-love928/CodeLess/pull/94#issuecomment-6578519170)。

真实重测分账：原f9 Windows完整runner原生0、285/285，单独预览API原生0、1/1；同f9完整E2E原生1、78通过/2失败（D06、D16）。新7db完整Windows E2E原生1、73通过/4失败/3未运行，D16原T1仍30s取消，D08/D09及全局截止相关失败保留；完整平台阶段未运行。不得用213单元或26专项替代完整门禁。

新7db双用户全链路原生1：两用户首次生成、修复、编辑、发布和导出已经执行，但最终“失败后仍可下载旧可用版本”在原10秒下载事件期限失败，整条链路未通过；本轮trace、API日志、初次ZIP和清理回执私存。旧c7链路通过不继承到新候选。原D06 trace曾读到，但未在下一次Playwright输出清理前单独封存，已不可取得；不提供虚构摘要。原CLI失败仍保留，新确定性回归独立验证补读缺口，后续失败目录已经单独私存。

预览502的原现场进一步核对：捕获的366次task/auth/csrf生命周期均完成，最长72ms；失败Nginx记录为上游CONNECT超时、无连接或响应头计时。这仅缩小到入口/宿主转发连接调查，不证明原因或排除日志遗漏。历史EPERM/ENOTEMPTY/CLEANUP_FAILED、原API中断和清理超时仍OPEN，没有根据新绿关闭，也未作猜测性产品修复。

原统一包仍未交接到B：已核对274/275预期payload，原镜像与原tar流未取得。PR94仍为c44592，只有SHA及A私有F盘路径，B不能据此取得字节。A需提供受控原件与唯一共享预算账本；新7db另需重新封存对应API/client/worker/image。生产仍61，真实模型及生产cover、新候选公网URL/源码ZIP同源尚未验收。总预算双方累计2元，B本轮付费调用/支出0，未新开额度。未部署、批准、合并或修改main。

新证据见 `tests/release/browser/evidence/d28/resolution/`（修复、各原生命令、失败、连接定位、后继绑定）；之前各节均为对应旧候选的历史记录。源代码7db和最终报告HEAD的远端检查分别读取，未完成或未知不记为通过。

# D28-B 候选版本用户流程独立验收

## 2026-11-02 专用runner与同候选环境准入（本轮）

**用户已指定B为专用验证runner；M5继续HOLD，未启动付费批次、未部署、未批准或合并。** engine指纹为`af5f9ddde52028586624a365bb11d0d06c83d6e6894691e3037ae5d03942e99f`。这是协调归属，不是操作系统级互斥锁；每次工作负载前仍需核对engine、活动作业和镜像。此前20分钟单侧提议仅保留为历史，不替代本次用户指定。

本轮只读复核A `c44592fa529637cbfa49aa86908d5cb767a67c87`，没有将A新增工具合入B或执行其付费/管理员脚本。统一封存源为`00fd43333f35c5cb0cce425721fdce9cd1d0f956`；A新40项迁移/合成恢复、真实D23恢复22项、镜像正常/歧义失败两条路径有回执，原13份摘要/258源码核验保留。

| 核验 | 本轮实际结果与边界 |
| --- | --- |
| 275成员清单 | 路径唯一、无越界，A的transport/group-verify候选和整体摘要一致；B独立取得或重建274份期望payload，字节长度/SHA精确匹配。来源是不可变Git00fd、公开原字节清单、未编译Git归档和B原D27封存实际payload；旧tar路径前缀仅用于查找，未转换payload。 |
| 尚缺原件 | B未取得167813120字节原统一tar（SHA`52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206`）及第275项新镜像tar（SHA`453e0f1ca248156677ae80dfbcbaf1052148a7a8894463fe4e06cb7bbfad9ddc`）；精确镜像ID查询也未找到。274份期望内容不能冒充已逐成员读过A原tar、复算整体摘要或验证镜像。已请求A提供受控只读制品入口，不公开机密备份/认证日志。 |
| B TLS第一槽 | 原network-preflight脚本，native0，12/12预期公共证书观测、12/12 JVM无凭据401，结束12:33:44 UTC。 |
| B TLS第二槽 | 同一原脚本与环境独立槽，native0，12/12及12/12，结束12:42:07 UTC。两槽原日志字节以base64/SHA保存在`coordination/tls-runner.json`，未改CA、代理、期望issuer或截止。此为B主机两时段证据，不保证长期稳定，不能移用于A原机。 |
| 启动失败保留 | 12:31首个启动器误用不存在的C盘GitBash，native1/ENOENT，TLS与JVM均未启动；改用实际E:/Git后才开始上述两槽。未重试真实失败的TLS槽筛绿。 |
| runner状态 | 初始盘点和最终复查均无活动codeless容器；policy-tag在初始与两槽的观察值相同，未build/retag/start容器或触碰生产。B仍缺新候选镜像，不把当前policy镜像当00fd镜像。 |
| 累计费用 | 沿用用户本轮总上限2元，用户报告当时支出0；B付费请求、支出及新增预留均0。A维护唯一累计账本，包含后续真实模型用户流程及失败/UNKNOWN预留，不给B另开2元额度。未同步当前账本与原件前不得启动批次。 |

正式用户流程、公网URL、源码下载和关键E2E绑定约定已落在`tests/release/browser/evidence/d28/coordination/binding.json`：先核对原包/275成员及API manifest `3d0e5210…`、client manifest `db83cd46…`、JAR `d2c1bc7b…`、worker `311ed218…`、image ID `e73196ca…`与revision00fd；A关闭历史根因后，部署维护者才成组切换，再由双方独立读实际JAR fd/worker进程/镜像和线上文件摘要。当前服务器仍61，所以正式链路处于**BLOCKED_BEFORE_LOGIN**，应用/版本/URL/ZIP字段保留null/NOT_RUN。

部署身份通过后，每条浏览器/下载回执同时记录平台候选、applicationId/versionId/sourceDigest/artifactDigest/publicationUrl/ZIP摘要；不得拼接历史61公网URL与本地c7 ZIP。采用新代码修复即新冻结候选和对应重测/清单，不能给旧00fd包重贴新SHA。既有c7本地专项仅作为上一轮独立证据，不继承为00fd公网验收。生产cover与真实模型效果也未执行。

[专用runner与受控制品交接请求](https://github.com/Echo-love928/CodeLess/pull/94#issuecomment-6577659974)。历史EPERM/CLEANUP_FAILED仍由A牵头，B本机原runner/E2E/预览502及ENOTEMPTY证据继续保留；两槽TLS通过不关闭它们。本轮仅新增记录/绑定约定，业务及测试实现未改；最终报告HEAD的远端检查仍须读取其自身结果。

## 前一轮修复与补验记录（固定源码与当时快照）

## 2026-11-02 统一候选修复与补验（当前结论）

**HOLD，M5 未通过，未批准、未合并、未部署新候选。** 统一候选 `00fd43333f35c5cb0cce425721fdce9cd1d0f956` 合入 A PR94@a16ac252 的调度与 Java 可移植性修复；再以 `c7c75efdcef2e2b7fda33e99e7a13ce40c72ed7a` 修复短租约测试夹具，并补齐预览构建终止诊断。两份候选各自精确 SHA 的远端六项检查均全部 completed/success；它们不覆盖本机原失败。后续证据/校验工具提交使用其自身 CI，不继承 c7 检查。

最新逐项证据：`tests/release/browser/evidence/d28/followup/summary.json`。原 c707、802、438 等执行记录及所有原失败均保留，以下历史内容不作为当前 SHA 的检查结论。

| 执行范围 / 固定源码 | 原生结果与证据 |
| --- | --- |
| Windows 完整四阶段 / 00fd433 | static0；API1（428项、2失败、0错误/跳过、90份新JUnit）；runner1（279/285、4失败/2取消/0跳过）；E2E1（72通过/5失败/3未运行，后续完整平台suite未启动）；ci-gate1。源码/HEAD前后相同，初末工作区干净。`followup/gate.json` |
| 修复影响范围 / c7c75ef | 仅恢复全类6项与预览1项，原生1：恢复6/6通过；预览1失败。构建原生0、5518ms，后续GET任务收到HTTP502；同次ingress记录upstream504,502、request60.040s。根因UNKNOWN，未延长30秒构建截止或放宽断言。`followup/affected-api.json` |
| Maven/D19 单独诊断 / c7c75ef | 原生0，11项通过；串行文件调度，私有观察器只记录原sh/taskkill的spawn/exit/close/kill事件，没有新增终止、重试或放宽限制。本次未复现异常终止，不能替代完整runner门禁或关闭历史原因。`followup/runner-diagnostic.json` |
| 两用户全链路 / c7c75ef | 原生0、浏览器0、canonical=true、cleanupErrors=[]；真实PG/Docker/Vue/Chromium，登录→生成→真实编译失败→REPAIR→编辑→显式发布→ZIP下载；两用户权限、离线重连、预览过期恢复、失败后保留旧版本、错误版本下载拦截通过。两用户各1440/390宽度与三路由，共12条刷新/无横向溢出观测。`followup/flow.json` |
| 精确SHA远端 / 00fd433、c7c75ef | 各自六success，原日志私存、获取命令和摘要公开；c7实际日志含API428/0/0/0、runner285、E2E80、完整平台browserExit0。`followup/ci-*.json` |
| 证据接纳与工具链 | 8项控制原生0；默认沙箱临时目录权限错误不当作产品失败，使用任务内临时目录。旧23引用与新增11引用直接核对Git blob/索引，校验通过不代表M5通过。 |

### 最小修复与范围扩展

- `services/api/src/test/java/dev/codeless/api/recovery/RecoveryConvergenceTest.java`：原来claim一秒租约后再freezeSource/创建多份文件，检查有效租约时已可能过期。把不依赖claim的文件准备前移；保留一秒租期、1200ms等待及有效/过期/迟到READY/清理断言，未改生产队列逻辑。新恢复全类6项通过，仅关闭该夹具时序问题，不关闭历史事故。
- `tests/e2e/preview/platform.acceptance.mjs`：原断言遗漏原生signal/error，使status=null无法辨别终止原因。新增任务私有`platform-build.json`，仅记录耗时、状态、信号、错误码/消息；不记录环境或会话，保留原30秒截止与成功断言。原全量失败与新502分别保存，没有重试到绿。
- 以上两项为共同API验收入口的必要最小范围扩展，已向A提交具体文件、影响和方案：[联合定位交接](https://github.com/Echo-love928/CodeLess/pull/94#issuecomment-6575565193)。A已审调度配置随统一候选合入。无生产源码、公共契约、依赖锁、CI、迁移或生产配置变更。
- 最终追加证据与证据校验器；产品与业务用例输入保持c7，重测范围为证据字节校验及最终精确HEAD远端门禁，不能沿用旧SHA检查结论。

### 仍需关闭的阻塞与交接

B负责本机runner/E2E失败与Windows原ENOTEMPTY现场：完整runner新增D07空启动标记、cover捕获失败、Maven恢复子进程status=null、D19截止/清理证明失败；D19 CPU用例同次结果为CLEANUP_TIMEOUT、browserClosed=false/processTreeTerminated=false。新单独11项通过不关闭这些失败。需要同次原生终止/句柄生命周期证据、确认机制后的最小修复和新候选受影响重测；不删除断言或加重试。

A与B联合处理预览API：新c7预览已通过真实构建并进入鉴权UI，但任务读取出现502，代理记录上游504后502；需关联同次API/连接/代理时间线定位，不推断是模型、Vite或生产故障。当前两轮已保留不同失败，停止无计划重复整套测试。A原EPERM、历史CLEANUP_FAILED与ENOTEMPTY原因仍OPEN；原B中断日志及73份XML重算全部匹配，原最终native仍UNKNOWN，不补成零。

新流程的URL、部署和ZIP在**本地独立HTTPS托管fixture**内按版本/源码/产物摘要核对；真实公网仍是61。A对现部署61的9项只读取证已审阅，不能标注新候选已部署或将历史公网与本地ZIP拼为同源证明。新候选公网部署/下载/源码成组身份、真实模型质量及生产cover仍受阻。阻塞未关闭及另一成员未批准前保持草稿，不合并。

### 证据与资源边界

A新增c44592已只读审查：50个增量文件均在A范围；13份公开回执SHA、注册表/manifest及258源码Git blob一致，真实D23历史恢复22项与空库/合成恢复40项均有原生回执。原机密包/备份/日志不在B主机，未冒称B二次恢复；不再将A恢复证据列为未执行或未交付。现部署对00fd仍原生1，记录/清单/镜像是61；真实评测TLS前置失败而未发起付费调用，带栈追踪UAC取消、测试未执行。M5保持HOLD。见`followup/peer-a-c44592.json`。

原日志、认证trace、ZIP、内核/线程原现场私存；公开限定投影和SHA。五秒进程采样按启动时间修正PID复用，6个不满足时序的身份被排除；未发现已验证身份的本轮残留，未终止任何其他进程。采样不能证明未采到的句柄不存在。线程栈只读观测过主线程校验快照，未据此归因历史故障。两张公开截图只展示静态目录占位页，不证明CRUD或真实模型质量。

付费模型请求0；本次专项17次明确mock，合成用量不冒充实测；开发input/output/total及跨全量实际累计用量UNKNOWN，分账记录。main本地指针7824069、远端基线2be793d未修改。

## 以下为历史初始执行记录

结论：**HOLD，M5 未通过，PR 保持草稿。** 本卡独立全链路专项已完整通过：原生0、浏览器1/1、两个普通用户、4个READY/1个真实FAILED、4成功/4失败build、2个PUBLISHED、cleanupErrors=[]，canonical=true。 新增用户流程专项与原四阶段门禁分账；任何局部通过均不覆盖原失败、取消、未执行或未知状态。

API恢复后的最终补验：剩余17类/78用例，原生0、failure/error/skip均0；与已封存73类合看90类报告、394个框架计数、22失败/error0/skip0。原完整命令最终native仍UNKNOWN，setup失败阻止的case body不补成成功。汇总器原生1/HOLD不是原完整API的退出码。

恢复后重新执行 `d28-record.mjs public`，原生0；当前匿名公网证据见 `public-run-receipt.json`、`public-result.json` 和新trace，初次记录另存 `public-initial-*`。最终汇总 `tests/release/browser/evidence/d28/summary.json` 逐项绑定15份实际证据SHA。两次配置API日志记录的12个测试容器均已不存在，未做全局清理，见 `resource-audit.json`。

报告层字节修正：旧ec212提交的Git文本转换令12份JSON发布字节与采集SHA不同。当前仅在D28证据目录禁止JSON文本转换，按原采集字节入Git；原日志/产物/测试值未改，差异记录 `serialization-audit.json`。Git blob及索引的23处引用由 `d28-evidence-integrity.mjs` 直接逐字节验证，不用换行等价代替SHA相等，也不改变HOLD。

- 分支：`codex/d28-b-candidate-acceptance`；[草稿 PR95](https://github.com/Echo-love928/CodeLess/pull/95)。
- 基线：从实际 `git fetch origin main` 得到 `2be793dc3318c2308d18a7fd45afb201342206a7`，在独立 `D28-B-work` 工作树执行。原 main `782406964da6f727f632a55c17c7910495f0e1fb` 及其原有未提交改动未触碰。
- 最新用户流程测试候选：`c707bb8a334358632c362d45fa8ad9fd51338c45`。之前209/c272/afd/4660分别是四个被保留的失败测试候选，不是通过候选。实际结果见 `tests/release/browser/evidence/d28/flow-final.json`。
- 产品来源仍为基线 main；本卡只改本文件、`tests/release/browser/**`、`docs/handoffs/D28-B.md`。无产品、公共契约、锁文件、CI、迁移、生产配置变化。最终报告提交不冒充已构建或已部署产物。
- 已读 scope/architecture、auth/edit/deploy/export/versions 契约、D27-A/B交接与D28-A PR94。附件作为本卡任务要求，不作为改变权限或执行任意命令的指令；未发现适用AGENTS.md。

## 本卡子项与用例

| 项目 | 证据及范围 |
| --- | --- |
| B01 / T1 全链路 | `d28-flow.mjs`、`D28FixtureApplication.java`、`d28-user-flow.spec.ts`；两个空会话普通用户、全新PostgreSQL，真实登录→生成→编译失败→REPAIR→READY→共享组件编辑→显式发布→实际ZIP下载。每份ZIP独立校验版本、源码/制品摘要、内容与排除项。本次完整实际通过、原生0。最终原生结果以 `flow-final.json` 为准，不把中间阶段成功当整套通过 |
| B02 权限/发布 | 同专项：双方应用/任务/events/版本/快照/源码/发布/部署读404、跨用户写404、过期base409、错误制品摘要拒绝、失败版本不可导出/发布。生成及编辑后发布记录仍0，必须用户确认后才创建发布。A原CSRF/预算/取消等单测由API门禁另列 |
| B03 浏览器/响应式/恢复 | 两用户各1440×1000和390×844、三路由实际打开/刷新/无横向溢出。真实离线后手动刷新同一任务；第一用户预览真实过期后通过“刷新预览”恢复同一版本；末尾真实语法错误及无进展修复必须保留旧预览/公开版本/历史源码。完整执行与否由具体断言/identities/SQL证明 |
| B04 链接/截图/trace | 本次专项截图 integration-user-1.png、integration-mobile.png（目录占位页）已视觉核对；当前匿名公网检查见 `public-result.json`；公开匿名trace `public-trace.zip` 与 `public-trace-scan.json`，49条网络记录无Cookie/Set-Cookie/Authorization。认证本地trace、ZIP、原日志私存，公开其路径/长度/SHA；不得公开真实会话 |
| T2 公开URL/源码 | **部分已核验，当前候选公网绑定仍BLOCKED**。历史[D27示例](https://d8acce2590cf08eb49e693b5140c7f0c1.sites.codeless-publish.top/)本次正常DNS/TLS、三路由与资源字节通过，匿名源码/元数据路径拒绝；新本地发布及ZIP属于独立本地托管fixture。没有本次受保护生产登录/部署实物证明，不把两组不同版本拼成同源公网结论 |
| T3 失败不冒充成功 | 本卡专项失败保护已完整通过，原生0；原失败/取消/未知字段全部保留。原门禁、前四轮新增测试失败与最终专项分别记录；模型完成声明不能推进状态，实际build/Chromium/SQL决定READY。最终失败保护是否完整通过查看 `failurePreservesVersion` 与原生退出，不推断未执行的部分 |
| T4 关键E2E | **未通过**：原必需E2E 77通过/2失败/1未运行，原120秒suite/teardown截止；后接的完整平台suite未启动。新增专项不是替换入口，未改变原assertion/timeout/retry/testMatch/隔离 |

## 精确命令与结果

从仓库根执行，工具链固定Node24.22.1、Corepack pnpm12.6.0、Java21、Playwright1.60.0。

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
$env:DOCKER_HOST=(docker context inspect --format '{{.Endpoints.docker.Host}}')
$nodeRealPath=node -p "require('node:fs').realpathSync(process.execPath)"
& $nodeRealPath tests/release/browser/d28-record.mjs flow
& $nodeRealPath tests/release/browser/d28-record.mjs public
& $nodeRealPath tests/release/browser/d28-record.mjs api
```

每次新建不可覆盖的 `.local-data/d28-b/commands/<timestamp>-<mode>/`，保存argv、原生退出/信号、HEAD、源文件字节摘要、原日志SHA及源码是否变化。`d28-export.py`只接受显式选定的run/command，不自动选较新或较绿结果。源码/报告/模型用量分账，不用预算数值填实测token。

**原总门禁**：`node tests/e2e/full/record-command.mjs gate`，内部原 `corepack pnpm ci:gate`，原生 **1**。`evidence/d28/first-gate.json`绑定原日志SHA、时间和源文件摘要；所有原始输入字节未变，过程中仅新增本卡验收文件，因此clean-canonical=false，不冒称全程干净。首轮未加stage-observer，各阶段父进程单独native字段保持null，不能补写0。

| 阶段 | 原真实结果 |
| --- | --- |
| static | Node64/64、UI212/212及lint/typecheck/Vite build日志完成；未单独捕获父进程native，字段null |
| API首轮 | Maven失败：305 tests、failure1/error110/skip0，未完成428实际用例。Testcontainers未发现当前Docker context；NVM符号链接Node被安全路径门禁拒绝。旧JUnit已独立封存，不用新报告覆盖 |
| runner | 285 tests，pass282/fail1/cancelled2/skip0。429包装器25秒超时、404子进程SIGTERM/null代替22、D19私网canary浏览器30秒超时；原断言/截止不改、机制UNKNOWN，没有重跑求绿关闭 |
| E2E | pass77/fail2/did-not-run1，原总120秒截止及teardown错误；D15托管和D16截图失败，D08浏览器用例未完成。截图/trace/原日志保留，后接完整平台NOT_RUN |
| ci-gate | 原生1/FAILED，不由任何后续局部成功推导0 |

API配置复核：同版本真实Node路径的原 `NodeCoverGatewayTest` 3/3、原生0。正确配置后的完整API命令在重启恢复阶段中断，原JVM及执行会话已不存在、最终退出码未写出，原因UNKNOWN，原receipt的RUNNING是失联旧状态而不是当前仍在运行。`api-interrupted.json`保存73类原始JUnit及日志摘要：316 tests、22 failures、error0/skip0；多项实际 `AGENT_CLEANUP_TIMEOUT` 和前置失败连锁断言，不能声称全绿。只对没有完整新JUnit的17类补验，未重跑22个失败求绿；补验单独native与合并记录见 `api-configured.json`。原完整native仍null，90类报告也不等于428个case body全部通过。它不覆盖原runner/E2E失败，也不关闭A机EPERM等旧问题。

## 新测试的失败历史和能力边界

1. `flow-first-failed.json`：209候选原生1，mock未知用量在第5次REPAIR触发真实保守预算。改为显式声明100/100/200的合成预算fixture，标记 `DECLARED_SYNTHETIC_NOT_MEASURED`；不改生产未知记账或预算。
2. `flow-second-failed.json`：c272候选原生1，新增双构建场景继承60秒单构建观察先到期，SQL仍VERIFY。仅新用例初始修复任务独立120秒，不改原必需测试及构建/浏览器工作进程截止。
3. `flow-third-failed.json`：afd候选原生1，但两个用户完整成功链和权限矩阵实际通过；第一用户闲置后预览凭据过期，选择器被正常移除。截图 `preview-expired.png`。新用例改为真实点击刷新预览恢复；没有延长凭据寿命、注入状态或修改产品。独立总480秒/零重试，原门禁失败保留。

4. low-fourth-failed.json：4660候选原生1，真实过期恢复已通过；末尾无进展修复产生两个实际失败构建并返回AGENT_REPAIR_NO_PROGRESS，但60秒观察先到期。仅新增该双构建负路径观察120秒，严格核对总4失败/4成功build，原门禁不动。

本地模型是明确deterministic-mock，合成token不是实测；PostgreSQL/Flyway、受限Docker/Vue构建、Chromium及下载字节均实际执行。本地托管使用显式loopback DNS/自签TLS/probe fixture，生产公网探测限制不变。真实模型质量与生产cover HOLD不因此解除。生成Tasks/Catalog是模板占位页，本卡三路由检查不承诺任务CRUD或目录筛选。

D27封存包独立只读核验：`d27-local-originals.json`、`d27-archive-verification.json`。四份CI原件、API/client成组tar和镜像tar的六项SHA全部匹配；259个API文件、11个客户端文件、258个源码blob逐一匹配61提交树，JAR SHA `d2c1bc7bccd9df9eec194fde509fa012f5c41eb3a7703aad669aaa447e067446`。这证明封存集合，不证明当前服务器实物。

`ci-log-representations.json` 给出原日志可重现获取方式：`gh run view 41297904093 --job ... --log`分别精确重现原API/runner SHA；直接job日志接口分别重现A的另一组SHA。两种输出字节不同，剥离标签/时间后也不完全相同，未归一化放行或声称二者相等；原件与获取方式已可提供给A复核。

同伴互审见 `evidence/d28/peer-review.md`：PR94@438c0f5，41文件范围合规、12公开回执SHA匹配、4证据负对照通过；精确HEAD远端E2E/ci-gate失败，本机API原EPERM及历史问题保留。未批准/发评论，未合并。

权限范围：矩阵中的跨用户404/409通过同一真实浏览器会话的HTTP调用核验；登录、组件选择、显式发布、版本选择与错误下载拒绝由界面实际操作。没有把接口拒绝单独当作所有界面导航、所有管理页面均已验收。

## 交接与放行

新候选真实公网身份/认证验收、原runner与关键E2E失败、A机EPERM、历史ENOTEMPTY/CLEANUP_FAILED、真实模型/生产cover及D23规范备份独立核验均不可由本卡局部通过解除。对应维护者需最小修复、新候选与受影响完整重测。最新main、精确PR HEAD所有必需success、无未解决讨论及另一成员批准前不得合并。

开发agent input/output/total：UNKNOWN/UNKNOWN/UNKNOWN，计量来源UNKNOWN，未提供累计接口；不把60,000预算当实测。平台运行时另账：新付费请求0；本卡专项的mock调用和声明合成token见 `flow-final.json.runtimeUsage`，原门禁累计mock用量UNKNOWN。

补充说明：末尾一次错误版本响应头是明确标记的传输负对照，ZIP来自本次真实历史下载；此前登录/生成/编辑/发布/实际下载接口均为真实HTTP。最终专项17次mock调用，声明合成输入1700/输出1700；五轮浏览器共57次mock，其中4次用量未知，已知合成部分5300/5300，所有实际总token仍UNKNOWN，详见runtime-usage.json。
