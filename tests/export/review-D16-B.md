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
