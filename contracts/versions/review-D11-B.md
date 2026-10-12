# D11-B 只读复审

最新复审：2026-10-12（Asia/Tokyo），[PR #34](https://github.com/Echo-love928/CodeLess/pull/34) HEAD `86400352d4cb485d279f781e5794c32b0394751b`，依赖A `4f364a3`，main `413e5b8`。只重查作者修复及受影响的适配器、组件、fixture、测试和真实验收入口；没有改B跟踪文件。以下当前结论取代后面的历史初审阻塞。

## 当前阻塞问题

- **旧 `/source` 契约阻塞已关闭**。`source-api.ts:24,43` 已读取A实际 `/files` 清单和 `/files/content?path=...`；按versionId/sourceDigest/path/bytes/digest关联，重算排序JSON清单及UTF-8哈希；配额与A40文件/128KiB单份/512KiB总量一致，设备名/case alias拒绝。没有发现本次修复新增业务代码阻塞。
- **真实面板缺口在本机闭合，旧EIO根因未闭合**。精确B HEAD独立工作树执行 `node tests/versions/record-command.mjs panel --repo .local-data/d11-a/review-b-8640035`，真实session/Postgres/Docker/Chromium/TLS/nginx/签名网关全部旧安全断言及新增面板断言执行，1/1、native exit0、0skip。B原环境exit1、EIO及清理报告仍保留在B `tests/e2e/versions/evidence/2026-10-12/real-panel-failure.json`。本机Docker29.8.2、B原环境29.8.0，不能将不同环境的通过当根因修复。
- 正式启用仍需登记维护者同步共享OpenAPI增量，本卡不抢改共享文件。A这次仅新增测试诊断/记录工具及交接，B依赖base更新后须按仓库规则同步、复核最新候选/必需检查。本次未提交APPROVED、未合并。

## 当前建议

- 历史来源继续明确“未提供”。`VersionWorkspace.vue:17`仅在当前task真实diagnostics包含该版本ID时回填来源，Workbench传入真实build.versionId，不推测全部旧版本；全量历史映射需维护者确认契约扩展，不要求A虚构字段。
- 读取器最多顺序读取40文件，每次服务器复核快照；若以后实测需要优化，可按选中文件读取并保留清单/内容关联及迟到请求保护。这不是本次阻塞。
- EIO复测使用带持久化native exit记录器；未写完成标记、signal或启动会话丢失不能猜0。旧失败不能被远端success解释或删除。

## 当前已核验内容

- source-api18 + version-api3 + VersionWorkspace3 = **24/24，exit0**，独立重跑；路径/配额/哈希/401/竞态/未知结果/来源匹配反向断言保留。B精确HEAD六项远端checks全部completed/success，URL在公开命令证据中，未沿用d54旧结果。
- SourcePanel分别解释409无快照/404缺文件或无权限，错配拒绝显示、401仍回登录；AbortController/序号保护、Vue pre/code文本插值保留，无v-html/eval。version-api从FAILED自己的冻结snapshot读取摘要，ID/source/status匹配，null退出码显示未知，缺失/错配保持FAILED，401不吞掉。
- 真实平台原鉴权、资源清理、到期/撤销/跨owner断言先执行，再opt-in面板：生成Ada和Hedy两份VERIFIED、一次真实失败构建和初始DRAFT；切换源/iframe共用versionId且文件哈希相等；DRAFT源码409保留预览；FAILED摘要、源码、凭据409及latestReady保持；script/img/onerror逐字显示、DOM无执行节点、window执行标记不存在。
- 实际报告、截图和命令/native exit/log SHA256：[`2026-10-12证据`](../../tests/versions/evidence/2026-10-12/commands.json)、[`D11-B-panel.json`](../../tests/versions/evidence/2026-10-12/D11-B-panel.json)及同目录T1/T2/T3/T4截图。已查看真实截图。只有模型提案使用明确mock；API/签名/DB/build/浏览器真实，非模型质量评测。
- 未改锁/迁移/CI/runner/后端业务，未删除失败断言或增加skip/retry、放宽隔离、引入真实秘密。B API侧opt-in IT在services/api测试范围；默认CI不执行该IT，本次显式独立通过。复审工作树复用现有锁定依赖junction，没有升级安装。

## 2026-10-11 历史初审（d54ea4d，旧契约阻塞已关闭）

2026-10-11（Asia/Tokyo）。初查未找到候选；收尾时发现并只读审查 [PR #34](https://github.com/Echo-love928/CodeLess/pull/34)，精确 HEAD `d54ea4d380ea844d007889728541a0c4ae94fbae`，基线 `413e5b8bc40e2ccf6b5c538a9f2b4fc0f02e9ccb`。读取全部26文件diff、UI/适配器/fixture/单测、D11-B交接及公开门禁报告；未修改B源码、未提交APPROVED。B的确定性报告不证明A+B真实联调。

### 历史阻塞问题

- **读取契约不一致，阻塞真实源码联调**：`apps/web/src/features/source/source-api.ts:8` 请求 `/api/v0/versions/{id}/source`，预期整包 `files:[{path,content}]`；A实际 `VersionController.java:59,65` / `openapi.patch.json` 提供 `/files` manifest 和 `/files/content?path=...` 单文件响应。B `features/versions/README.md:16` 已诚实标为待确认建议。复现：在合并A+B的候选中以owner登录，选择VERIFIED版本；列表和iframe可成功，源码请求 `/source` 没有后端映射，HTTP404并显示“源码接口尚未接入”。A可复现的正常读请求为 `/files` 后 `/files/content?path=src/pages/HomePage.vue`。由B局部适配器/面板接入已实测A契约，保留manifest的versionId/sourceDigest及单文件path/bytes/digest检查；fixture也改为真实路径/结构。A不跨模块替B改UI，不新增重复聚合接口。
- **真实联调仍未执行**：B `tests/e2e/versions/fixture.ts` 和 `flow.spec.ts:93` 拦截上述建议路径；8/8报告只证明fixture UI。契约修正后，最后启用PR需以真实session/PG/生成版本/iframe验证切版本页面与源码、错误处理、失败保留预览及脚本文本；不能以fixture替代。
- B本地API门禁的真实EIO失败保留在 `tests/e2e/versions/evidence/2026-10-11/api-build-failure.json`，不是本卡发现的业务回归。远端结果须按B精确HEAD重新核验，不把本地失败删掉或当success。
- 新增HTTP路径的公共OpenAPI同步由登记维护者/最后启用功能PR承担；A提供 `openapi.patch.json`，未抢改 `contracts/openapi.v0.json`。这限制接口的正式集成声明，不影响已实测的A独立API。

### 历史建议

- 按 `README.md` 的 `versionId` 读取源码并签发该版本预览；切换版本后丢弃旧请求的迟到响应。不要从 taskId 或可变草稿目录取当前源码。
- DRAFT/FAILED/VERIFIED 使用明确状态；只以 `latestReadyVersionId` 或用户选中的 VERIFIED 版本请求预览，禁止把草稿当已验证版本。
- 409 `SNAPSHOT_UNAVAILABLE` 区别于成功空数组；错误显示可重试信息，不将读取失败渲染成“无文件”。
- `content` 使用文本插值/代码文本节点；不得 `v-html`、eval、动态模块导入或插入可执行 script。复现fixture：`<script>alert(1)</script>` 应显示原文本，不能弹窗。
- B `source-api.ts:10,18,22` 的200文件/JS字符上限与A40文件/128KiB单文件/512KiB总UTF-8字节上限不同。文档和fixture同步A边界；展示文本时保留服务器的字节/hash元数据。`flow.spec.ts:61` 使用 `src/untrusted.txt`，真实A只允许受控Vue/TS路径；恶意文本fixture应放进允许路径的`.vue`源码，不能要求扩大文件权限。
- A列表目前沿用v0，未新增taskId/errorSummary；B已有明确缺失占位，兼容性不阻塞。新增来源/失败摘要如需要，由维护者另确认公共契约，不能从当前task推测旧版本来源。

### 历史已核验内容

- B `VersionWorkspace.vue:40` 仅VERIFIED且有buildId时切previewId，DRAFT/FAILED源码选择不换iframe；`version-api.ts:22`拒绝未知状态/缺VERIFIED build，列表损坏不猜成功。
- B `SourcePanel.vue:19,25,28,34` 先清旧源码，AbortController和序号丢弃迟到结果；`VersionWorkspace.vue:26,31,42` 应用/列表刷新亦有序号保护。空列表、读取错误、空快照使用不同文本，401发出登录事件。`SourcePanel.vue:51` 使用Vue文本插值，路径/错误摘要亦插值，无v-html/eval或可执行源码节点。
- `flow.spec.ts`覆盖版本切换、空/错误/重试、失败保留iframe、script/img文本、损坏元数据、错配/迟到源码及401/分页；作者报告8/8专项、53/53前端、41/41完整E2E。本次读取并审查报告与断言，未在A工作树重跑B fixture，也不当真实集成证据。
- 全部diff只含B UI、必要Workbench挂载、测试、文档与证据；`tests/e2e/preview/browser.acceptance.mjs:183,207` 两个alert断言限定到preview-panel，保留原错误文案和安全断言。未发现依赖/锁/CI/迁移/后端更改、秘密或测试弱化。静态审查与公开报告的检查范围不等同于部署安全证明。
- A实际HTTP验收提供版本列表、三状态过滤、空列表、源码JSON文本、读取失败、权限隔离和禁止PUT的报告，见 `tests/versions/evidence/2026-10-11/`。这不是B UI测试。
- A保留既有预览 `versionId/buildId/sourceDigest/artifactDigest` 绑定与私有可信根检查，源码API从单独冻结的版本卷读。真实平台预览与源码一致性回归由A自己的API测试负责。
- 结论：完成只读互审，存在上述契约阻塞，**不批准**。作者修复后只复查适配器、受影响组件/fixture/测试，并在真实联调和精确HEAD门禁通过后按仓库规则决定批准。
