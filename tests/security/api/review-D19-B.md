# D19-A 对 D19-B 的只读互审

- 对象：草稿 [PR #56](https://github.com/Echo-love928/CodeLess/pull/56) `codex/d19-b-runner-security`，HEAD `587f830978d1bda7e3a6efadb75db038fdbcb296`（运行时代码与断言候选 `4ef96b8`），基线 `3ec4b99`。
- 方式：隔离 worktree `.d19-b-review/`（detached，只读；未提交、未推送、未改 B 的文件）。读取 B 的交接、`docs/security-runner.md`、全部生产 diff 与 5 个安全测试、记录器和已提交证据；本机重跑见“已核验内容”。
- 重点（任务卡）：拒绝私网/元数据/重定向绕过；容器超时后无残留工作进程；恶意站点无法读取平台凭据；全部安全 fixture 有确定性结果；范围、失败路径、秘密与测试强度。

## 阻塞问题

本次检查范围内**未发现**阻塞问题。

## 建议（非阻塞）

1. **close 后重放的断言可能没有观察到消息就通过**（`tests/security/runner/site.test.mjs` 中 `window.session.close()` 之后）。
   iframe 用真实 `parent.postMessage` 重放 selection，父页只等一次 `setTimeout(0)` 就断言 `selections.length === 1`。预览站点与平台不同站，Chromium 站点隔离下两者在不同渲染进程，跨进程 postMessage 与 Playwright 发出的下一条 evaluate 之间没有先后保证。
   因此若 `close()` 失效，只要消息晚到，本断言仍会通过；“close 后重放无效”依赖没有保证的跨进程时序，不是确定性结果。实际上消息通常先到，本次未观察到假通过，这里只指出断言没有等待送达。前 6 个伪造消息用同步 `dispatchEvent`，不受影响。
   核验方法：把 `selector-session.ts` 的 `close()` 改为不置 `closed = true` 后运行该用例；它能否失败取决于消息是否在 `setTimeout(0)` 之前送达。
   最小修复：父页加一个只计数 `type === 'selection'` 消息的监听器，等待计数增加（证明重放已送达并经过 `receive`）后再断言 `selections.length === 1`。
2. **T2 构建超时只有 2 秒**（`build.test.mjs` `run('timeout', 2000)`）。容器冷启动加 node 启动若超过 2 秒，`D19_CHILD_RUNNING` 还没输出就超时，断言失败。这只会造成假失败、不会假通过，但在负载高的 CI 上可能不稳定。
   可以先等子进程标记再计时，或放宽到 5 秒并保留标记断言。
3. **writer 不核对 receipt.files 与写入字节一致**（`services/runner/src/publish/store.mjs` `admittedInput`）。首次写入接受任意 `files`：`store.test.mjs` 的冻结用例以 `files: []` 写入两个文件，私有回执与公开内容不一致。之后同一请求的幂等重放会因数量不符被拒绝（失败关闭，不是越界）。
   上层 publisher 从已验证清单构造回执，所以不构成外部利用。可在 writer 里要求 `files` 与 buffers 的路径、字节数、摘要逐项一致，使回执不可能错述已发布内容。
4. **记录器的 `revision` 不标识被测代码**。`commands.json` 中前 9 个运行的 `revision` 都是基线 `3ec4b99`（工作区未提交），被测内容只能靠 `sourcesSha256` 识别；03:14Z 的本地门禁启动之后，writer 又改过一次（03:22Z）。
   B 的交接已写明这一点，并以 `4ef96b8`/`587f830` 的远端检查为准；建议记录器在工作区不干净时把运行标为非 canonical，避免读者把它当作某个提交的结果。
5. **站点测试依赖宿主代理设置**（`site.test.mjs` 的 `chromium.launch({ args: [..., '--no-proxy-server'] })` 与 `newContext({ ignoreHTTPSErrors: true })`）。
   本机启用了系统代理（`ProxyServer=127.0.0.1:7897`，另有 `HTTP(S)_PROXY`）。在这里，B 的记录器运行（`.d19-b-review/.local-data/d19-b/2026-10-21T06-20-57.361Z-security`）为 10/11，站点用例在 `page.goto(platform)` 处 `net::ERR_CONNECTION_CLOSED`，单独重跑同样失败。
   最小探针显示 TLS fixture 一个事件都没收到（连接没有到达 fixture）；只在上下文里加显式代理与 bypass（与 `tests/e2e/preview/platform.acceptance.mjs:48` 相同）后，同一探针得到 200。
   这是失败关闭，不掩盖问题，但结果取决于宿主代理配置。建议照 `platform.acceptance.mjs` 给上下文加 `proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' }`。这样既不依赖宿主代理，也会让 fixture 之外的流量明确失败。
6. **联调项**：B 的平台是静态 fixture。恶意预览/公开站点对真实 API 做带凭据的跨站请求（读取 `/api/v0/auth/csrf`、写请求）应由最后启用 PR 在真实 API 上覆盖。A 侧已证明 API 没有 CORS 授权、坏令牌一律 403（`docs/security-api.md` T2），SameSite=Lax 使跨站子请求不带会话 Cookie。

## 已核验内容

| 项 | 方法 | 结果 |
| --- | --- | --- |
| 范围 | `git diff --stat 3ec4b99..587f830 -- services/api apps contracts scripts .github pnpm-lock.yaml package.json infra` | 空。只改 `services/runner/src/publish/store.mjs`、`services/runner/src/screenshot/worker.mjs`、新增 `tests/infra/security-runner.test.mjs` 入口、`tests/security/runner/**`、两份文档。没有删除或放宽既有断言（diff 的 2 行删除都在上述两个生产文件中）。 |
| 秘密 | 对 diff 的新增行扫描 `sk-…`、私钥头、AWS/GitHub 令牌模式 | 无。测试用的是运行时生成的自签证书、`KEY_HEX` 测试密钥与明确命名的假秘密。 |
| 私网/元数据/重定向 | `network.test.mjs`、`probe-policy.mjs` `publicAddress` | 地址策略只放行 IPv4 全局单播（全部 IPv6 失败关闭），拒绝 0/8、10/8、127/8、≥224、169.254/16、172.16/12、192.0/16、192.168/16、100.64/10、198.18/15、198.51/16、203.0/16。19 个地址（含十进制/八进制/十六进制写法、IPv4 映射）在到达 transport 前被拒；5 种状态 × 5 种 Location 都只发 1 次请求。浏览器侧 fetch/导航/WebSocket/metadata 对真实 canary 的命中为 0。 |
| 容器超时无残留 | `build.test.mjs` T2 与 `services/runner/src/build/runner.mjs` | 生产 runner 超时先 `SIGKILL` docker CLI 子进程并等待 `close`（宿主侧无残留 CLI），再 `docker kill`、按 inspect 取终态（137）、删除容器；测试另行 `docker ps -a` 为空、`docker inspect` 退出 1。容器内子进程随 PID namespace 一起消失。 |
| 恶意站点读取平台凭据 | `site.test.mjs` | 平台 HttpOnly 会话、普通 Cookie、Local/SessionStorage 种在同一浏览器上下文；预览（`sandbox="allow-scripts allow-same-origin"`，与 `PreviewPanel.vue:93` 一致）读 parent、公开站点读 opener 都是 SecurityError，自身存储为空，gateway 收到的 Cookie 不含平台值。生产发布链接是 `rel="noopener noreferrer"`（`DeployPanel.vue:171`），测试覆盖了更坏的 opener 存在情形。 |
| 截图 deadline | `worker.mjs` diff | deadline 定时器从浏览器启动一直覆盖到清理，超时强制 kill；超时结果总是 FAILED、无截图。完成后清理期间超时也判失败，属于失败关闭。 |
| writer 越界 | `store.mjs`、`store.test.mjs` | UUID 部署 ID（长度 + 正则，换行被拒）、`publicFile` 白名单（只允许 `index.html` 与 `assets/<名>.<扩展名>`）、设备名、大小写别名、2000 文件 / 32 MiB / 1 MiB 回执，并在第一个 await 前复制 receipt 与字节。 |
| 本机重跑 | worktree 内 `pnpm install --frozen-lockfile --prefer-offline`（exit 0）后 `node tests/security/runner/record-command.mjs security` | exit 1：10/11 通过，站点用例因本机系统代理失败（建议 5）。构建隔离、超时回收、地址/重定向、浏览器 canary、CPU 忙循环、截图对抗、writer 全部通过。 |
| 站点断言 | 审查者副本 `.d19-b-review/.local-data/d19a-probe/site.proxy-bypass.test.mjs`：只给上下文加代理 bypass，其余逐字相同；B 的跟踪文件未改（`git diff --quiet`） | exit 0，1/1。预览与公开站点读取 parent/opener 均 `SecurityError`，自身 Cookie/存储为空；6 条伪造消息被拒、合法消息 1 条；6 个私有路径 404。 |
| 远端检查 | 公开 API 读一次：PR #56 head `587f830` 的 run [39539955022](https://github.com/Echo-love928/CodeLess/actions/runs/39539955022) | infra-preflight、verify:static、verify:runner、verify:e2e、verify:api、ci-gate 六项 completed/success（03:50:11Z）。 |
