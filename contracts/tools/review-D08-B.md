# D08-A 对 D08-B 的只读互审

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
