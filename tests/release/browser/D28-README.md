## 2026-11-03 最新：统一封存与真实质量复评，M5 HOLD

当前代码候选 `0a7e0761114aa25e47ccdfbac02bd9d5fa5d4a6a`，已包含 A 的 `c28ee9499f2434045dc25547a4231662bf2edf96`。按用户最新决定，历史根因不再作为放行阻塞；原件保留，不写成已修复。下方更早日期/阶段结论均为历史快照，以本节和 `release-20261103/status.json` 为当前结论。此前 Windows 全四阶段、桌面/390px双用户流程、A原件及预算审计复用，不重跑。

本轮实际完成：API/JAR、worker、客户端、带新revision标签的镜像及对应验收代码重新封存，278个包成员、113个共享源码文件一致，原包167936000字节，SHA256 `c18b456e779cc385b2ff8086e8eaf7deb33e56241898a329e99821a049356406`。原包已送达既有受控渠道并逐项复核。精确SHA六项检查及同一账本CAS的最终状态见 `release-20261103/candidate.json`，旧包、旧预算事件和本轮支出不重置。

修复一：生产cover原先继承仅接受构建/发布的IPC入口，独立只读复现拒绝截图。新增 `CODELESS_COVER_NODE_EXECUTABLE`，未配置时保留原默认；capture仍使用原环境白名单、目标校验、截止与API服务隔离。新回归在旧代码确实失败；受影响cover配置/网关/协调器/存储/HTTP共23项通过，随后新增YAML变量解析回归3项通过。初次YAML测试属性源优先级错误及修正均保留。生产worker仍未启用，不以本机测试冒充生产cover。

修复二：目录行为验收器遗漏原生/ARIA按钮卡片及可见叶子span元数据。补足展示形式识别，保留8/6/9数量、三个非空字段、作者/名称搜索、分类交集、详情值、清空与恢复全部断言；72项受影响正反控制及2项ARIA控制通过。仅重放此前失败的CAT-01/02/03原源码，已过的SHOW/TASK不重复；三份目录最终均通过，原3/9结果和中间失败不覆盖。

真实批次 `2026-11-03T07-32-26Z-real-ef4add12` 在统一候选 `a4f44860245027c9b17b28083b96db17d1b22a4f` 上按原14样本、原预算/截止、单次进程、无外层重试执行。12/12 TLS与12/12 JVM准入通过；14份原记录均齐，进程均自行退出0，凭据扫描0。**平台成功6/9，修正展示兼容后的需求行为6/9，未达8/9；代码故障2/3，环境故障2/2。** SHOW-02/03返回非法JSON；TASK-03返回协议外json_object包装；FAULT-CODE-03因剩余输出额度下finish_reason=length，未到注入阶段。72次实际模型请求，71次有完整用量、1次UNKNOWN；已知输入258149、输出42347，实际总tokens和实际账单仍UNKNOWN。共用2元上限未变，本轮保守费用暴露1.255074元（含UNKNOWN完整0.4元占用），不当作实付金额。后续没有补跑付费批次。

新候选与原真实批次的生成/模型/runner/prompts/templates/冻结评测代码均无差异；278个JAR资源/类逐字节比较，仅cover配置类和application.yml变化。模型失败继续适用，不能因新封存或CI绿灯关闭。原始批次/请求响应/进程回执/trace已受控交付1553文件，目录增量另交付34文件；公开仅投影、摘要与复现定位。

**当前阻塞问题：** A需处理上述模型协议/额度内完成性问题并提交最小修复及受影响证据；禁止修剪JSON、接受协议外对象、提高原预算、重置账本或将失败改为通过。B已完成两项可独立修复及证据交接，仍须在真实质量达标后成组切换最终候选，实际验证公网URL、下载ZIP、部署清单/生成版本同源，以及生产cover账本与PNG字节。生产仍为61历史版本，新候选未部署，当前不新增公网同源/生产cover通过结论。双方增量复审前不批准、不合并，main未改。

当前证据：`tests/release/browser/evidence/d28/release-20261103/{status,model-quality,cover-and-catalog-fixes,candidate}.json`。受控原件访问定位仅通过既有私有渠道交接。

---

## 以下为历史阶段记录（保留原结论）

# D28-B 独立用户流程验收

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


基线 `2be793dc3318c2308d18a7fd45afb201342206a7`。生产模块、契约、锁文件和既有必需测试只读。

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
# Windows Testcontainers 不读取 Docker CLI 的当前 context，显式传入本机实际 endpoint。
$env:DOCKER_HOST=(docker context inspect --format '{{.Endpoints.docker.Host}}')
corepack pnpm install --frozen-lockfile
$nodeRealPath=node -p "require('node:fs').realpathSync(process.execPath)"
& $nodeRealPath tests/release/browser/d28-record.mjs flow
& $nodeRealPath tests/release/browser/d28-record.mjs public
```

使用仓库锁定 Node 24.22.1、pnpm 12.6.0、Java 21、Playwright 1.60.0；不升级依赖。
Node须使用真实路径；本机 `E:/nodejs` 是NVM符号链接，生产路径门禁会拒绝它。使用同版本 `E:/nvm/v24.22.1/node.exe` 的原 `NodeCoverGatewayTest` 3/3通过；不关闭链接检查，也不改断言。

`d28-flow.mjs` 和 `d28-user-flow.spec.ts` 从基线 D20 完整业务验收复制基础设施与原断言，仅在本卡允许目录独立扩展，未替换原门禁。`D28FixtureApplication.java` 只在测试 classpath 编译，不进入生产 JAR，也没有生产 profile/HTTP 开关。明确的 deterministic-mock 首次提供缺组件导入；真实 Docker 构建失败，生产 REPAIR 用可信源码摘要更新导入，再真实构建和 Chromium 验证。两个全新普通用户分别完成登录、生成、修复、共享组件编辑、显式发布、下载和 ZIP 独立核验。每个用户还验证桌面/390px 移动端三路由、刷新和横向溢出。

本卡mock每次调用声明100输入/100输出/200合计的**合成预算fixture值**，标记 `DECLARED_SYNTHETIC_NOT_MEASURED`，不能充当模型实测用量。首轮继承unknown usage时，第5次REPAIR调用被真实保守预算拒绝，`AGENT_MODEL_BUDGET_EXCEEDED`；原失败回执保留。改为显式合成账本用于测试后续流程，生产预算、未知记账、模型凭据与既有断言不变。

保留原跨用户404、过期编辑409、错误摘要拒绝、真实离线恢复、错误版本下载拦截与历史源码核验。新增用例启用修复，因此末尾明确语法错误后的 bare done 应以 `AGENT_REPAIR_NO_PROGRESS` 终止；它必须保留旧预览、发布和源码。SQL断言实际失败构建4个、成功构建4个：两个初始生成各失败一次，末尾未修复候选及bare done后的原样复核各失败一次，不能用模型声明代替结果。新用例独立截止480秒/总500秒、零重试；两个初始修复和末尾无进展修复均为双构建任务，观察上限120秒，普通编辑60秒，原必需用例的超时/断言/重试不变。

第二轮修复构建与浏览器已实际执行，但继承的单构建60秒观察先到期，SQL任务仍VERIFY、failureCode=null，未作READY结论。该轮native1/trace继续保留；新修复用例单独明确双构建观察窗口，不能用它覆盖原门禁的任何超时失败，也不放宽构建/浏览器工作进程截止或生产12分钟任务预算。

第三轮两个用户已完成全部成功链、两份ZIP独立核验和双向权限矩阵；末尾开始失败保护检查前，第一个用户的预览凭据因真实空闲而过期，界面正确移除了iframe/组件选择。该轮native1和截图/trace保留。新用例通过真实“刷新预览”按钮恢复同一版本后才继续；不延长生产凭据寿命、不注入凭据。新独立总窗口按两条已实测约335秒成功链，加显式过期恢复和真实失败保护/历史下载阶段，固定480秒，不覆盖原门禁失败。

第四轮显式过期恢复已通过；末尾无进展修复也实际产生两个失败build并以 `AGENT_REPAIR_NO_PROGRESS` 终止，但它仍继承60秒单构建观察，原生1保留。将该新双构建负路径同样明确为120秒，并按实际生产重验证语义严格断言总4失败/4成功build；原必需测试及所有业务成功/失败断言不变。

该本地链使用显式 loopback DNS/自签 TLS/托管 probe fixture，生产公网探测限制不变。它不证明公网部署或真实模型效果。Tasks/Catalog 是受控模板占位页；路由检查不宣称已生成任务 CRUD/目录筛选功能。

`d28-public.mjs` 对固定平台和 D27 已知示例执行匿名只读 GET 与浏览器操作，使用正常 DNS/TLS、不注入响应。当前资源逐字节核对历史清单，桌面/移动截图和全程 trace 保留；它不证明当前 API/worker/image 身份，也不将历史示例当成本次新发布。

`d28-record.mjs` 的 flow/public/api/e2e/gate 模式记录原生命令、退出/信号、HEAD、输入字节摘要和私有日志摘要，不重试。gate仅在父进程复用已有被动 stage-observer，记录原 ci-gate 各阶段退出；不注入子进程。原门禁生成的历史 evidence 文件先私存新字节再恢复旧字节，避免覆盖历史证据。

全部新运行在 `.local-data/d28-b/`；认证 trace、ZIP、原日志只保留本机，公开证据提供其长度/摘要/定位。匿名 trace 经请求头检查后方可公开。最终结果以 `evidence/d28/`、`docs/acceptance/frontend.md` 与 `docs/handoffs/D28-B.md` 为准。缺凭据/部署证明及同伴失败必须保留 BLOCKED/HOLD，不能由局部绿测推导 M5。

恢复补验：原正确配置API命令在重启恢复阶段失联，未留下最终native；73类JUnit中316计数/22失败已由 `d28-api-audit.py` 一次性私存，原receipt不重写。`d28-api-remaining.mjs` 仅对固定候选c707下缺少完整新JUnit的17类补验，输入见 `evidence/d28/api-remaining-plan.json`（执行现场副本位于 `.local-data/d28-b/api-remaining-plan.json`）；已失败套件不重跑。该脚本是此次冻结现场的恢复记录器，不是任意HEAD的完整门禁替代入口。

`python -B tests/release/browser/d28-api-summary.py --remaining-command <明确的api-remaining目录>` 校验原73份私存XML、补验17份XML的新鲜度/字节/原生退出，输出 `api-configured.json` 并原生1/HOLD。17类78项原生0不代表完整API原生0，90类报告也不等于428个case body均已执行。原完整门禁入口仍为 `corepack pnpm verify:api`。

`python -B tests/release/browser/d28-archive.py --prior-worktree ../D27-B-work` 只读检查封存tar、镜像、259/11文件及258 Git blob/JAR；需先具备固定61提交Git对象和受保护的原件，不自动获取凭据或部署。每次保存新的独立结果目录、校验器SHA和真实argv，不提取归档、不做字节归一化。

公开证据按采集原字节冻结：`evidence/d28/.gitattributes` 仅对本目录JSON设置 `-text`，禁止Git默认换行转换改变公开文件SHA。它不作用于产品、契约或私有原件，也不是CRLF/LF等价放行；旧报告提交ec212的12处发布字节差异单列 `serialization-audit.json`。`node tests/release/browser/d28-evidence-integrity.mjs` 直接读取Git blob验证23处公开引用；`--staged`检查索引。该检查通过只说明报告引用字节一致，不改变HOLD或任何功能/门禁结果。
