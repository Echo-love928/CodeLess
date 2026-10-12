# D11-B 只读互审状态

2026-10-11（Asia/Tokyo）。初查未找到候选；收尾时发现并只读审查 [PR #34](https://github.com/Echo-love928/CodeLess/pull/34)，精确 HEAD `d54ea4d380ea844d007889728541a0c4ae94fbae`，基线 `413e5b8bc40e2ccf6b5c538a9f2b4fc0f02e9ccb`。读取全部26文件diff、UI/适配器/fixture/单测、D11-B交接及公开门禁报告；未修改B源码、未提交APPROVED。B的确定性报告不证明A+B真实联调。

## 阻塞问题

- **读取契约不一致，阻塞真实源码联调**：`apps/web/src/features/source/source-api.ts:8` 请求 `/api/v0/versions/{id}/source`，预期整包 `files:[{path,content}]`；A实际 `VersionController.java:59,65` / `openapi.patch.json` 提供 `/files` manifest 和 `/files/content?path=...` 单文件响应。B `features/versions/README.md:16` 已诚实标为待确认建议。复现：在合并A+B的候选中以owner登录，选择VERIFIED版本；列表和iframe可成功，源码请求 `/source` 没有后端映射，HTTP404并显示“源码接口尚未接入”。A可复现的正常读请求为 `/files` 后 `/files/content?path=src/pages/HomePage.vue`。由B局部适配器/面板接入已实测A契约，保留manifest的versionId/sourceDigest及单文件path/bytes/digest检查；fixture也改为真实路径/结构。A不跨模块替B改UI，不新增重复聚合接口。
- **真实联调仍未执行**：B `tests/e2e/versions/fixture.ts` 和 `flow.spec.ts:93` 拦截上述建议路径；8/8报告只证明fixture UI。契约修正后，最后启用PR需以真实session/PG/生成版本/iframe验证切版本页面与源码、错误处理、失败保留预览及脚本文本；不能以fixture替代。
- B本地API门禁的真实EIO失败保留在 `tests/e2e/versions/evidence/2026-10-11/api-build-failure.json`，不是本卡发现的业务回归。远端结果须按B精确HEAD重新核验，不把本地失败删掉或当success。
- 新增HTTP路径的公共OpenAPI同步由登记维护者/最后启用功能PR承担；A提供 `openapi.patch.json`，未抢改 `contracts/openapi.v0.json`。这限制接口的正式集成声明，不影响已实测的A独立API。

## 建议

- 按 `README.md` 的 `versionId` 读取源码并签发该版本预览；切换版本后丢弃旧请求的迟到响应。不要从 taskId 或可变草稿目录取当前源码。
- DRAFT/FAILED/VERIFIED 使用明确状态；只以 `latestReadyVersionId` 或用户选中的 VERIFIED 版本请求预览，禁止把草稿当已验证版本。
- 409 `SNAPSHOT_UNAVAILABLE` 区别于成功空数组；错误显示可重试信息，不将读取失败渲染成“无文件”。
- `content` 使用文本插值/代码文本节点；不得 `v-html`、eval、动态模块导入或插入可执行 script。复现fixture：`<script>alert(1)</script>` 应显示原文本，不能弹窗。
- B `source-api.ts:10,18,22` 的200文件/JS字符上限与A40文件/128KiB单文件/512KiB总UTF-8字节上限不同。文档和fixture同步A边界；展示文本时保留服务器的字节/hash元数据。`flow.spec.ts:61` 使用 `src/untrusted.txt`，真实A只允许受控Vue/TS路径；恶意文本fixture应放进允许路径的`.vue`源码，不能要求扩大文件权限。
- A列表目前沿用v0，未新增taskId/errorSummary；B已有明确缺失占位，兼容性不阻塞。新增来源/失败摘要如需要，由维护者另确认公共契约，不能从当前task推测旧版本来源。

## 已核验内容

- B `VersionWorkspace.vue:40` 仅VERIFIED且有buildId时切previewId，DRAFT/FAILED源码选择不换iframe；`version-api.ts:22`拒绝未知状态/缺VERIFIED build，列表损坏不猜成功。
- B `SourcePanel.vue:19,25,28,34` 先清旧源码，AbortController和序号丢弃迟到结果；`VersionWorkspace.vue:26,31,42` 应用/列表刷新亦有序号保护。空列表、读取错误、空快照使用不同文本，401发出登录事件。`SourcePanel.vue:51` 使用Vue文本插值，路径/错误摘要亦插值，无v-html/eval或可执行源码节点。
- `flow.spec.ts`覆盖版本切换、空/错误/重试、失败保留iframe、script/img文本、损坏元数据、错配/迟到源码及401/分页；作者报告8/8专项、53/53前端、41/41完整E2E。本次读取并审查报告与断言，未在A工作树重跑B fixture，也不当真实集成证据。
- 全部diff只含B UI、必要Workbench挂载、测试、文档与证据；`tests/e2e/preview/browser.acceptance.mjs:183,207` 两个alert断言限定到preview-panel，保留原错误文案和安全断言。未发现依赖/锁/CI/迁移/后端更改、秘密或测试弱化。静态审查与公开报告的检查范围不等同于部署安全证明。
- A实际HTTP验收提供版本列表、三状态过滤、空列表、源码JSON文本、读取失败、权限隔离和禁止PUT的报告，见 `tests/versions/evidence/2026-10-11/`。这不是B UI测试。
- A保留既有预览 `versionId/buildId/sourceDigest/artifactDigest` 绑定与私有可信根检查，源码API从单独冻结的版本卷读。真实平台预览与源码一致性回归由A自己的API测试负责。
- 结论：完成只读互审，存在上述契约阻塞，**不批准**。作者修复后只复查适配器、受影响组件/fixture/测试，并在真实联调和精确HEAD门禁通过后按仓库规则决定批准。
