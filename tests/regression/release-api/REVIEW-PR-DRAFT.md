# D26-A review follow-up：真实IPC取消交错与原组合计数摘录

B对PR90精确d4d250f未发现新增生产代码阻塞，本次补齐两项非阻塞建议，生产代码、公开API/提示词、依赖与隔离均不变。

- 新增真实父端/stdio worker IPC回归：收到请求时在许可回调前取消，实际许可0、browserPid0、worker已关闭，任务仍FAILED。私有内存副本移除停止守卫后被同一断言拒绝；无公网fixture，不修改正式模块，不将负对照称为历史产品故障。
- 原10项加2项，限定回归12/12、exit0；原静态门禁exit0（Node64/UI206）。冻结CLI报告改为本轮新目录，避免覆盖旧证据；旧冻结与7份原失败不变。
- 原A组合完整日志先校验固定SHA及39107字节，再仅导出80 passed行与full-product status/browserExitCode子串，共57字节，附原偏移与摘要。旧回执不改，未新跑E2E；B远端75/75与A组合80/80分账，未单列native值保持null。

本轮基线PR90/d4d250f六项远端SUCCESS已独立复核；新HEAD检查未开始。生产内容相同，未重复原完整API/runner/E2E或B串行21项隔离，不继承其成功。继续draft/HOLD：原镜像/Maven历史根因、历史cleanup精确归因、REAL质量和生产capture缺口保留，不部署、启用、批准或合并。

本地分支 `codex/d26-a-review-evidence`，base=d4d250f；精确源/证据提交见最终清单。输入报告仅保存摘要，不公开微信源目录或全文。完整命令和证据见 `docs/handoffs/D26-A.md` 最新补记及 `evidence/review-2026-11-01/`。新公开载荷尚未上传，需核对实际清单和授权范围。
