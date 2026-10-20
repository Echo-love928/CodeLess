# D16-A 对 D16-B 的只读互审

审查对象：[PR #49](https://github.com/Echo-love928/CodeLess/pull/49) `codex/d16-b-share-cover` @
`4d99ea0ce2de2c767dfbdd16a8530a8e5e4877f9`（base `main` `03c7905`，2 个提交、37 个文件）。2026-10-19，Asia/Tokyo。

方法：在独立 detached worktree 中只读审查全部 diff、B 交接、screenshot README、测试与证据；复用主检出的锁定
`node_modules`（junction，未安装、未升级）。没有修改或提交 B 分支的任何文件；临时复现测试在运行后删除，副本见证据目录。
命令、退出码与日志摘要：[review-b-4d99ea0/commands.json](evidence/2026-10-19/review-b-4d99ea0/commands.json)。

## 阻塞问题

1. **下载适配器与已存在的 D16-A 契约不一致，真实下载必然失败。**
   - 位置：`apps/web/src/features/source/export-api.ts:14`（路由）、`:22-27`（响应头/长度校验）、`:44`（长度与 ZIP 摘要复核）。
   - 路由：B 请求 `/api/v0/versions/{id}/source-export`；D16-A（[PR #48](https://github.com/Echo-love928/CodeLess/pull/48)，
     [contracts/export/README.md](../../contracts/export/README.md)）是 `/api/v0/versions/{id}/export`。真实 API 返回 404，界面显示“源码导出尚未就绪”。
   - 响应头：B 强制要求 `X-Version-Id`、`X-Application-Id`、`X-Source-Digest`、`X-Archive-Digest`（ZIP 字节摘要）和数字 `Content-Length`；
     D16-A 返回 `X-CodeLess-Version-Id`、`X-CodeLess-Source-Digest`、`X-CodeLess-Artifact-Digest`、`X-CodeLess-Content-Digest`，
     流式响应没有 `Content-Length`、应用 ID 头或 ZIP 字节摘要。即使路由对齐，真实响应也会被判“源码包与所选版本不匹配”。
   - 影响：卡片要求的“下载按钮对应当前选定版本”在真实接口上无法完成。B 的 T4 单测与浏览器用例只针对 B 自定义的传输 fixture
     （`export-api.test.ts:11,18,22`、`tests/e2e/share/flow.spec.ts:48,53`），不能证明与真实接口兼容；B 的 PR 正文与 README 也如实写明尚未对齐。
   - 复现：[a-contract.review.test.ts](evidence/2026-10-19/review-b-4d99ea0/a-contract.review.test.ts) 用 D16-A 公开证据中的真实 ZIP 与真实响应头调用 B 的
     `exportSource`，3/3 预期全部复现（路由 404、头部不匹配、409 显示为可重试）。在 B 工作树的 `apps/web` 下放入 `src/review-d16a/` 后运行
     `node node_modules/vitest/vitest.mjs run src/review-d16a/a-contract.review.test.ts`。
   - 最小修复：路由改为 `/export`；校验 `Content-Type: application/zip`、`X-CodeLess-Version-Id === version.id`、
     `X-CodeLess-Source-Digest === version.sourceDigest`；去掉对 `Content-Length`、`X-Application-Id`、`X-Archive-Digest` 的强制要求，
     保留读取时的 16 MiB 上限与 `PK\x03\x04` 校验；把单测和浏览器 fixture 改为真实头部。若仍要逐字节核对 ZIP，A 可以在 #48 中先以确定性“预演”
     计算并增加 `X-CodeLess-Archive-Digest` 与 `Content-Length`（不缓冲整包）——需双方确认后再加，不能由 B 单方面假设。

## 建议（非阻塞）

1. 下载按钮对 DRAFT/FAILED 版本也可点击（`SourceDownload.vue:38`，`:disabled="!version || loading"`）。真实 API 返回 409
   `EXPORT_VERSION_UNAVAILABLE`，而 `export-api.ts:20` 把它显示为“此版本源码导出失败，请重试”，重试不会成功。建议仅在 `status === 'VERIFIED'`
   时启用，并对 409 提示“仅已验证版本可下载源码”（契约「D16-B 接入」第一条）。
2. 截图队列最多保留 100 条且无自动清理（`queue.mjs:69` `QUEUE_FULL`，README 已说明）：第 101 次发布起不再生成封面（发布本身不受影响）。
   启用前需确定保留/归档策略。
3. `owner.lock` 在宿主崩溃后只能人工清理（`queue.mjs:31`，README 已说明）。建议启用 PR 提供检查旧进程是否存活的运维脚本。
4. 错误提示可读取 JSON `code`（401/404/409/503）分别显示，而不是按状态码统一文案。
5. B 本机 `RepairLoopIntegrationTest.recordedUnchangedReadLoopStopsBeforeAnotherModelOrBuild` 失败在 A 环境与远端 CI 均未复现（见下）；
   根因仍未知，建议保留 B 的原始失败记录，不改写为通过，也不认定为已证实的缺陷。

## 已核验内容

- **截图成功关联正确部署**：`target.mjs:10-36` 只接受部署 ID，URL 由 ID 派生（`:14`）并必须等于 PUBLISHED 记录（`:15`），逐文件重算 receipt 摘要；
  `queue.mjs` 入队与每次执行都比对 application/version/source/artifact；`adapter.mjs` 每次读元数据与图片都重做 owner 与绑定校验，图片还需
  imageDigest。截图验收 T1 通过（真实 Chromium PNG 与持久队列重开）。
- **截图超时不把网站标为失败**：队列不写 publication/SQL；两次尝试后为 FAILED/CAPTURE_TIMEOUT；`DeploymentCover.vue:33` 显示占位图与
  “封面暂不可用，网站仍已发布”，公开地址保留；T2 与 `share/flow.spec.ts` 通过。
- **私网与云元数据不能成为截图目标**：DNS 的全部答案必须是公网 IPv4（`target.mjs:35`，`probe-policy.mjs` 拒绝 0/8、10/8、127/8、169.254/16、172.16/12、
  192.168/16、100.64/10、≥224 以及全部 IPv6，含 IPv4 映射地址），连接固定已校验 IP、保留 TLS 校验、拒绝 3xx；Chromium 没有 DNS
  （`worker.mjs:26` `MAP * ~NOTFOUND`），经拒绝式代理，页面请求只能从已校验字节 fulfill（`:36-43`），WebSocket（`:34`）、WebRTC、Service Worker、
  弹窗、下载均被阻断，且任何越界请求都使截图失败。T3 与真实 Chromium 私网请求用例通过。
- **下载按钮对应当前选定版本（界面层）**：点击时复制版本快照（`SourceDownload.vue:16`），版本/账号切换时 generation 作废迟到响应（`:13,:20`），
  不回退 latestReady；显示下载版本 ID 与源码摘要；发布面板区分分享版本与选定版本。与真实接口的对齐见阻塞问题 1。
- **范围**：仅 `apps/web/src/features/{deploy,source}`、`services/runner/src/screenshot`、`tests/e2e/share` 与 `docs/handoffs/D16-B.md`；
  根锁、CI、API、迁移与共享契约未改；既有文件只改了 `DeployPanel.vue`、`SourcePanel.vue` 两处组件挂载，没有修改任何既有测试。
- **秘密**：新增行没有私钥、token、密码或 API key 模式；证据与交接中唯一的绝对路径是 JDK 安装目录，没有用户目录。
- **测试未削弱**：B 移除的 5 秒覆盖使成功用例回到生产默认 12 秒；并发、全局超时与失败断言未放宽（diff 中无既有测试修改）。
- **A 本机独立复测（B 精确 HEAD）**：前端 source/deploy 单测 60/60、全部前端 131/131、lint/typecheck/生产构建通过、Playwright `share/*` 3/3、
  截图验收 7/7、`RepairLoopIntegrationTest` 21/21（含 B 本机失败的用例），均退出码 0。
  先按 B 的记录器运行 unit/browser 时，pnpm 12 因审查工作树的 `node_modules` 为 junction 拒绝启动（`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`），
  测试没有执行；随后直接用 Node 调用相同的 vitest/Playwright 命令。该启动失败不计为 B 的失败或成功。
- **远端**：PR #49 @`4d99ea0` 六项检查全部 success（[run 39257860299](https://github.com/Echo-love928/CodeLess/actions/runs/39257860299)，
  含 verify:api 与 ci-gate），快照见 [pr49-checks.json](evidence/2026-10-19/review-b-4d99ea0/pr49-checks.json)。

## 结论

**暂不批准（Request changes）**。截图隔离、绑定与失败保留符合卡片四项中的前三项；下载按钮必须先与已存在的 D16-A 契约对齐，
才能满足第四项并进入当天联调。作者修复后只复查 `export-api.ts`、`SourceDownload.vue`、对应测试与受影响范围，按仓库规则再决定是否批准；
不自批 A 的 PR，不合并。

已于 2026-10-19T13:40:58Z 以 yuanqizuimeng 身份在 PR #49 提交 CHANGES_REQUESTED（commit `4d99ea0`）：
https://github.com/Echo-love928/CodeLess/pull/49#pullrequestreview-5572416771 。

---

## 复审：修复提交 `4765062`（2026-10-19，当前结论）

范围：只复查 `4d99ea0..4765062` 的 1 个提交（30 个文件）及受影响范围。base 仍为 `main` `03c7905`，B 未改 D16-A 文件或 main。
证据：[review-b-4765062/commands.json](evidence/2026-10-19/review-b-4765062/commands.json)、[pr49-checks.json](evidence/2026-10-19/review-b-4765062/pr49-checks.json)。

### 阻塞问题

无。原阻塞问题 1 已关闭：
- `export-api.ts` 改为 `/api/v0/versions/{id}/export`，只校验 `Content-Type: application/zip`、`X-CodeLess-Version-Id`、`X-CodeLess-Source-Digest`，
  不再要求 `Content-Length`、应用 ID 头或 ZIP 字节摘要；保留流式 16 MiB 上限（超限 cancel）与 `PK\x03\x04` 校验；文件名与 A 的 `Content-Disposition` 一致。
- 单测改用 A 的真实 ZIP（SHA 固定）与真实头部，逐项覆盖头部缺失/错误、空/截断/非 ZIP、超限、流中断与全部错误码；删除的断言只针对已作废的自定义头部，不是削弱。
- **A 独立实测真实联调**：在 A 最新 HEAD `9dd6723`（含 P2 修复）的临时 worktree 中放入 B 的开发用 `BSourceExportInteropTest`（未提交，用后删除），
  `mvnw -Dtest=BSourceExportInteropTest test` 6/6、exit 0：B 未 mock 的生产适配器经真实会话 HTTP 流下载，字节与直接 owner 导出相同、无 `Content-Length`，
  其他 owner 404、匿名 401，DRAFT/FAILED/非法 ID 不发请求；报告不含 cookie。

### 建议（非阻塞）

1. 截图验收 `real stdio worker is forcibly bounded and its process tree is reclaimed`（`tests/e2e/share/screenshot.acceptance.mjs:140-143`）在本机
   5 次中失败 1 次：`cleanupConfirmed` 为 false。该测试与 `capture.mjs`/`worker.mjs` 本次未改；与 B 交接记录的 Windows taskkill 竞态一致（worker 越过
   BROWSER_STARTING 后自行退出、taskkill 报 PID 不存在时按设计判为“未确认”）。生产行为是保守的（不重试），但 `share/screenshot.spec.ts` 在 verify:e2e 中运行它，
   偶发失败会让门禁变红。建议让该用例在父级截止前不可能自行退出，或只在有 taskkill 128 与 browserClosed 证据时接受“已回收”，使结果确定。
2. 按最旧 `completedAt` 淘汰可能移除长期未更新应用的“最近成功”部署封面（README 已说明会显示占位图）。可考虑优先淘汰已被同应用更新部署取代的封面。
3. `BSourceExportInteropTest` 继承 A 的测试类并使用其包内字段（`port`、`login`、`other`、`ready`）；A 若重命名需同步该开发工具。

### 已核验内容

- 原建议 1–4 已处理：DRAFT/FAILED 按钮禁用并说明原因，`exportSource` 本地拒绝且不发请求，状态变化作废迟到下载；409/503 按 A 的错误码分别提示；
  终态封面按最旧淘汰（只删队列根下的直接子目录，删除前核验成员，从不淘汰进行中或正在运行的任务，图片读取与淘汰串行）；
  离线锁恢复 `recover-lock.mjs` 必须显式 `--workers-stopped`，PID 存活或无法确认、跨主机、锁内容/inode 变化时一律拒绝。建议 5：B 原始失败记录保留（交接 +37/−0）。
- A 本机复测（B 精确 HEAD `4765062`）：前端 source/deploy 76/76、全部 147/147、lint/typecheck/生产构建通过、Playwright `share/*` 3/3、
  队列验收 4/4；截图验收首轮 6/7（见建议 1），诊断性复跑 4 次均 7/7（不覆盖首轮失败）。
- 范围：仍仅 `apps/web/src/features/{deploy,source}`、`services/runner/src/screenshot`、`tests/e2e/share`、`docs/handoffs/D16-B.md`；新增行无秘密、cookie 或用户目录。
- 远端：`4765062` 六项检查全部 success（[run 39267143514](https://github.com/Echo-love928/CodeLess/actions/runs/39267143514)，含 verify:api、verify:e2e 与 ci-gate）。

### 结论

**无阻塞问题，可以批准（Approve）**，以 B 当前 HEAD `4765062` 为准。合并仍需：双方 PR 各自获得非作者批准、同步最新 main 后全部必需检查 success、
无未解决讨论；最后启用 PR 负责共享 OpenAPI/静态门禁登记以及公开地址 + 封面 + 源码包的真实联调。

已于 2026-10-19T14:53:26Z 以 yuanqizuimeng 身份在 PR #49 提交 APPROVED（commit `4765062`，正文为本「复审」节，相对链接换成 `6b98d80` 固定链接）：
https://github.com/Echo-love928/CodeLess/pull/49#pullrequestreview-5573425353 。此前对 `4d99ea0` 的 CHANGES_REQUESTED 保留在 PR 历史中。
