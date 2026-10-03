# D08-A 实测证据

来自 `FileToolsIntegrationTest` 的真实 Java 文件工具、PostgreSQL Testcontainers 和固定 D05 fixture；无真实模型请求。T1–T4 与 `tool-receipts.json` 是测试实际序列化结果，包含原始调用ID、时间、哈希、失败码/null和事件，不是手写预期。

`fixed-source.json` 是三文件真实工具快照；`fixed-build.json` 是 D07 真实离线 Docker 退出/清理/日志/产物 manifest；`fixed-browser.json` 和 `screenshots/fixed-catalog.png` 来自实际浏览器三路由、LocalStorage和搜索断言。源码摘要采用与 B 一致的紧凑排序 JSON manifest。

`peer-integration-root.json` 保留 B 真实 BROWSER_UNAVAILABLE 失败，不是成功证据。`peer-probes.json` 是默认 ::1 失败/显式 IPv4成功及真实服务 `/tasks` 404 的对照；debug WebSocket会话能力值已脱敏。其余内路径只转换为 evidence-relative标记，状态/哈希/字节/null不改写。原始命令日志和报告保留在 `.local-data/d08-a/evidence/`。

复现命令见 `contracts/tools/README.md` 和 `docs/handoffs/D08-A.md`。B 精确候选为 `0208b5d080b86e5f7bb4ac70a5713d0fc743b26b`；独立互审与跨PR联调未通过，不能用本卡固定harness或B旧CI结果替代。
