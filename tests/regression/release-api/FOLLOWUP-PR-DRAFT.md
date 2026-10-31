# D26-A follow-up：截图启动需父进程许可，冻结身份区分原始字节与检出换行

截图 worker 原来发送启动通知后立即启动 Chromium；父进程没有看到消息不能证明浏览器未启动。现在 worker 等待父进程明确许可，父进程先登记许可再发送；截止或取消后不批准启动。只有自有 worker 已关闭，且 native 清理、browserClosed 或明确未曾许可的证据充分时才确认清理；已许可/未知且无清理证据仍失败。真实子进程红测保留旧代码无许可仍出现 Chromium PID 的结果。

同时保留原冻结和四份混合换行原件，用固定 PR88 Git blob 与明确登记的 LF/CRLF 摘要核验非提示词文件。提示词和七份历史失败记录保持原 raw 校验；两个已确认的提示词检出差异可显式备份恢复到原冻结字节，未知内容拒绝覆盖。原机 runner 完整阶段日志也已找到、校验并保留，不能据此宣称旧镜像删除机制已定位。

- 独立分支 `codex/d26-a-cleanup-followup`，base PR88 `codex/d26-a-release-blockers` / 6ceeb5a；生产候选222bc90。不包含 B/PR89 的生产或测试改动，组合验证另列 A+B+PR89 的精确身份。
- 最小范围扩展仅两个 runner 截图文件；其余为 release-api 测试、证据和两份交接文档。未修改公开 HTTP API/schema、提示词内容、锁/依赖/迁移/CI、超时/预算/隔离或原断言。
- 新增确定性与真实进程边界10/10；固定 PR89 原截图验收7/7。真实完整组合 static0（Node64/UI206）、API0（90组428/428、零failure/error/skip）、runner0（285/285、零fail/cancel/skip）、E2E0（80/80及随后原完整平台链、browserExitCode0/retries0、清理无错）。执行期间源码字节与HEAD均未变，无诊断观察器；总ci-gate未重跑，不记原生success。source identity核对证明组合生产内容与代码222bc90相同。
- 原镜像失效、B 原 Maven429/404 根因仍 UNKNOWN；新通过不覆盖原失败，旧 ci-gate1、原6/9、13/14、自然 REAL FAILED、生产 capture 缺口继续 HOLD。诊断器自身干扰的两次运行单独保留并排除为生产根因证据。

保持 draft；不自批、不合并、不部署或启用 capture。PR89 只增强失败信息，需 B 增量检查私有许可协议、未知清理仍拒绝、四份原件及 prompt 严格身份。完整回执见 `docs/handoffs/D26-A.md`、`docs/release-blockers.md`。

目前仅本地草稿：本轮源载荷推送被自动审批拒绝，旧e98bc8b/171文件授权不覆盖新的公开载荷。最终逐文件清单完成后需用户明确授权；未换通道、未创建新远端PR，原PR88保持原样。最新元数据HEAD的远端检查UNKNOWN，不能继承已测源候选或旧PR结果。
