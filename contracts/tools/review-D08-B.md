# D08-A 对 D08-B 的只读互审

## 重新审查：94d9d36（当前结论）

日期 2026-10-03。精确候选 `94d9d36289441a07add9585bb3157952031b4ea7`，base/main 均为 `4a8f75c4bb7600c03aa141ac68b7bd7e016b7828`。只复查相对 `0208b5d` 的修复和受影响范围；B 工作树保持只读且干净。审查人 `yuanqizuimeng`，作者 `Echo-love928`，无自批。

### 阻塞问题

原 P2 已修复，本次范围未发现未解决阻塞。`services/runner/src/artifacts/routes.mjs:2-7` 共享三个精确路由；`service.mjs:45-48` 仅映射文档请求到已校验、冻结在内存的 index；`worker.mjs:54-66` 仅允许同 origin 主 frame 的三个固定导航，资源仍须真实 manifest 路径。HTTP GET/HEAD、Tasks/Catalog 导航与刷新实际通过；未知路由、编码/越界、iframe/script/image/fetch 使用文档别名继续拒绝。不是通配 fallback。

### 建议

原 IPv6 兼容建议已落实：`worker.mjs:27` 显式绑定 `127.0.0.1`，本机真实 Chromium 控制连接和两次跨 PR 验证通过，网页目标策略未放宽。既有公共 Build 异常表达、browser evidence 与不可变版本 READY 持久关联、部署隔离/回收仍由公共维护者或最后启用 PR 接手；它们不是此次路由修复引入的问题，此批准不表示这些生命周期已接通。

### 已核验内容

- 读取新增共享路由、服务/worker 差异、README/交接及增量测试和报告，未见超出 B 卡范围、版本/依赖升级、秘密或弱化既有断言。两个新增测试保留未知路径/资源误用拒绝。
- 独立执行 B 的 `artifacts.test.mjs` 与 `acceptance.test.mjs`，退出 **0，14/14，0跳过**。真实 Docker→Chromium 正常页通过，白屏/JS异常失败；PAGE_OPEN_TIMEOUT 与 SCREENSHOT_TIMEOUT 分类正确；内网管理服务实际命中0，云元数据/WebSocket被拒绝；watchdog 真实终止失控进程树。合法 Tasks 新增后刷新保留、Catalog 筛选/刷新通过。
- 在 A 候选生产实现 `b7989cd` 独立重跑真实 PostgreSQL/文件工具：退出 **0，13/13，0 failures/errors/skips**，新生成三页不可变快照和 T1–T4 审计。增强 A 自己的 `tests/tools/peer-workflow.test.mjs`，保留根页/Tasks原断言，并增加14动作 Tasks刷新保留→Catalog筛选/刷新→返回Tasks保留；对未修改 B 候选运行退出 **0，1/1**，两次真实构建/浏览器结果均 VERIFIED，控制host127.0.0.1，错误集合为空，浏览器已关闭。
- 源码摘要 `sha256:907860c4dcc8de6add6507a8bbeb13c852926943f7f00c944e0ab49226045ba8` 与 Java 工具快照、B扫描及浏览器报告一致；产物摘要 `sha256:d6c797d8bef781d074f6fa9d38806600d7d80892e75cd42ded50ea1bf19f1670` 与真实构建/浏览器一致。导出23份实际报告，重新读取校验7份PNG的字节数、签名和SHA-256。
- 首次复测因本机 Docker Desktop 停止而退出1，API数据库10项报错、B两项真实构建失败；其余浏览器与静态用例12项通过。保留原失败日志；启动已有Docker并确认29.8.1就绪后重跑，未改B或失败断言。这里的成功以第二轮实际结果为准。
- 精确候选的六项远端检查 `verify:static/api/runner/e2e`、`infra-preflight`、`ci-gate` 均 completed/success：[运行37104521374](https://github.com/Echo-love928/CodeLess/actions/runs/37104521374)。当前main与base一致，GraphQL reviewThreads为空且无下一页。未重复运行未受影响的本地全阶段；远端是该精确提交的真实结果。

复现：在 A 根加载 `.local-data/d07-a/env.ps1`，设置 `CODELESS_FILE_EVIDENCE_DIR=.local-data/d08-a/recheck-94d9d36`（绝对路径）、`CODELESS_D08_B_REVIEW_ROOT=.local-data/d08-a/peer-review`（绝对路径）、`CODELESS_BROWSER_EVIDENCE_DIR=<evidence>/browser`。分别执行定向 Maven、`node --test <peer>/tests/runner/browser/artifacts.test.mjs <peer>/tests/runner/browser/acceptance.test.mjs`、`node --test tests/tools/peer-workflow.test.mjs`。完整命令、退出码、日志SHA-256与报告在 `tests/tools/evidence/2026-10-03/recheck-94d9d36/commands.json`；原始日志在 `.local-data/d08-a/recheck-94d9d36/`。

结论：已由独立审查人提交[正式批准](https://github.com/Echo-love928/CodeLess/pull/17#pullrequestreview-5399531989)，对应精确候选94d9d36；PR保持草稿，未合并或修改main。开发token计量未知；平台真实模型调用0。

## 首次审查记录（历史，已由上述复查更新）

审查：[PR #17](https://github.com/Echo-love928/CodeLess/pull/17)，精确候选 `0208b5d080b86e5f7bb4ac70a5713d0fc743b26b`，base `4a8f75c`。
只读工作树 `.local-data/d08-a/peer-review`；未修改 B 的代码、测试或契约。

## 阻塞问题

**P2：受控 Vue 的合法路由无法打开或刷新。** `services/runner/src/artifacts/service.mjs:44-46` 只提供 manifest 中实际存在的路径；`services/runner/src/verify/worker.mjs:52-58` 也只允许这些路径。D05 的 `templates/vue/src/router.ts` 使用 `createWebHistory()`，固定路由为 `/`、`/tasks`、`/catalog`，构建不会生成 `tasks` 文件。`validateActions([{type:'navigate',path:'/tasks'}])` 合法，但 worker 会拒绝该导航，产物服务对鉴权 `/tasks` 实际返回 404。因此计划中的 Tasks/Catalog 页不能通过 B 的 navigate/reload 验收。当前 suite 只验证展示根页，未覆盖该正常路径。

复现：先按 tools README 产生实际工具快照和构建，再用 B 的 `openArtifactService` 注册该真实构建，带内部 capability header GET `/tasks`；`.local-data/d08-a/evidence/peer-probes.json` 保存实际 `tasksHttpStatus:404`、`workerAllowsTasks:false`、合法动作与静态 manifest。完整期望断言保留在 `tests/tools/peer-workflow.test.mjs`，没有删除或改成“拒绝即通过”。建议只为三个固定主文档路由提供冻结 index.html 映射，并同步 worker 主文档白名单；任意其他路径、资源和外部 origin 继续拒绝。增加 `/tasks`、`/catalog` 导航和刷新真实测试后再复查。

## 建议

本机默认 `chromium.launchServer()` 返回 `ws://[::1]:...`，`chromium.connect()` 被 Windows 拒绝为 EACCES；同一固定 Chromium、同一脚本加 `host:'127.0.0.1'` 可真实连接。位置 `services/runner/src/verify/worker.mjs:26`。这是本机环境/兼容性限制，不能把当前 BROWSER_UNAVAILABLE 当页面验收成功。建议显式绑定与产物服务相同的 IPv4 loopback；没有要求放宽浏览器目标网络策略。实际对照记录在 `peer-probes.json`。

公共 Build 对真实 exit0 后 ARTIFACT_INVALID 的表达差异、browser evidence 与版本 READY 的持久化关联仍须公共维护者/最后启用 PR 处理。此审查不据独立 worker 通过宣称任务生命周期已接通。

## 已核验内容

- 阅读 B 全部变更、内部 README、workflow、静态快照/服务、受控动作、worker/verifier 和测试及交接。新增文件在本卡范围，未见秘密、根锁/CI/公共迁移改动或削弱既有断言。
- 独立执行 `node --test .../artifacts.test.mjs .../acceptance.test.mjs`：退出 **1**，12 项中静态/动作 5 项通过，浏览器 7 项因上述 ::1 环境限制失败，零跳过。静态五项验证未完成/未知构建拒绝、manifest 篡改、越界/外部 proxy/CONNECT/方法拒绝、hardlink/symlink/大小限制、封闭动作和上下文复制。
- `tests/tools/peer-workflow.test.mjs` 对 A 真正生成的三文件快照调用 B：真实 D07 Docker 构建 exit0、清理完成，A/B 源码 JSON manifest 摘要一致；实际 browser 失败 BROWSER_UNAVAILABLE，退出1，未进入后续 `/tasks` 断言。`peer-integration-root.json` 保存真实结果，不能声称已完成 A+B 浏览器联调。
- B 当前精确候选的远端六项 Checks（static/api/runner/e2e/infra-preflight/ci-gate）均 completed/success，运行 37095938842；这是 B 在其 CI 环境的结果。已提交正常页/白屏/JS异常/超时/内网与云元数据拒绝/哈希报告及截图可读，但本机未独立通过浏览器用例，远端通过也未覆盖合法深链问题。

结论：请求修改固定 Vue 路由支持；本地环境建议与代码阻塞分开登记。未批准、未合并。
