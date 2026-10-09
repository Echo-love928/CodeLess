# D10-B shared acceptance cleanup takeover

B 接手 S01–S03，用户原话为「现在作为B进行接手操作」。独立分支 `codex/d10-b-shared-cleanup`，基线 `18f05d5023b92ece4ff9a257c218f97e566be524`；依赖 A 草稿 PR #26。精确候选用本 PR 的 headRefOid / git rev-parse HEAD 核对。未修改 main、A 业务源码/分支、公共 CI/锁文件/契约或平台修复协议、动作、3轮/12模型/20工具/50,000 token/12分钟预算。

共享 Java 准备与 watchdog 原先在异常、超时或中断后不能保证回收后代进程；两个 Node finally 的浏览器/TLS/runtime 关闭一旦失败会跳过后续 compose down。现在 Windows 在运行目标前放入私有 Job，Linux 建立独立 session，按归属终止后代；Node 逐项独立关闭并设每项10秒上限，继续执行原 down 与完整资源查询。Java 兜底清理使用不可覆盖 nonce 归属文件，仅允许本任务 target 内的原项目与 envFile，自身也受进程监督与90秒期限管理；不能确认的清理保持非零/UNKNOWN。原主体异常、中断旗及实际 Node 非零退出均保留，不把清理故障写成成功。

扩展范围仅为相应共享验收测试及私有辅助文件。另修正原 runner watchdog 测试的故障注入竞态：load 后0ms timer 可能在导航完成前阻塞，原失败实际为 PAGE_OPEN_TIMEOUT/timedOut=false；冷启动探针还捕获 LAUNCH 超时。新 fixture 在 CONTENT 读取 textContent 时才阻塞，测试私有 watchdog10秒/navigation5秒，保留 FAILED、timedOut、processTreeTerminated 断言，新增 CONTENT/CONTENT_TIMEOUT 精确断言。未改生产 runner 或生成验收动作。新增 Node 回归用 `.regression.mjs` 且由 Java API 测试显式执行，避免 Playwright 默认扫描 `.test.mjs` 带来 cwd 污染。

## 复现

使用仓库已固定的 Node24.16.0、pnpm12.6.0、Java21、已有 Docker 和 Playwright 浏览器；仅 mock。运行前删除 CODELESS_MODEL_API_KEY、CODELESS_MODEL_NAME、CODELESS_M1_REAL_APPROVED。以下均从仓库根执行：

- `node --test tests/e2e/generation/shared-cleanup.regression.mjs tests/e2e/generation/project-cleanup.regression.mjs`：27项，包括两个实际 finally、三种永不完成 close、原异常保留、down失败与截断/无效查询、nonce/路径/归属拒绝。
- `services/api/mvnw.cmd -f services/api/pom.xml -Dtest=PreviewAcceptanceProcessTest,RepairPreviewPlatformAcceptanceIT,PreviewAcceptanceCleanupIT,PreviewAcceptanceInterruptIT -DreuseForks=false -DforkCount=1 test`：8项真实三级进程与3项明确 mock 的真实平台专项。Linux 使用 services/api/mvnw。
- `node --test --test-name-pattern="whole-run watchdog" tests/runner/browser/acceptance.test.mjs`：真实 CONTENT watchdog 与进程树停止。
- `pnpm ci:gate`：原 static/API/runner/E2E 四阶段，不跳过失败。

正常专项保留同任务缺失组件构建失败→mock REPAIR→重建/浏览器通过及签名预览；故障专项实际 browser.close 后抛错，整体验收失败但原 down/资源查询和 Java fallback 完成；中断专项等到实际本项目 ingress 容器可观测后中断原 Java wait，保留 InterruptedException、中断旗及清理结果。正常与故障模型次数以各自 budget/events 为准，故障/中断没有完整用量时为 UNKNOWN。全部不构成真实 M1 模型效果。

## 三类结论及限制

阻塞问题：M1 仍 NOT_PASSED；历史已授权真实任务 0aa30892-2759-4725-8149-2d0fcf329126 的 AGENT_MODEL_PROTOCOL_INVALID 失败保留，不自动追加付费任务。须在另行授权有界真实验收成功、精确候选检查及同伴批准后才具备合并条件。历史 Windows FileTools cleanup、TCP/TLS/504/application GET/fetch/exit137/OOM 等事件不能凭此次入口整改关闭，原因未确认者继续 UNKNOWN。

建议：Windows Job 与 Linux session 只能证明本次受管理入口及已观测路径；强制终止整个宿主、断电或故意脱离 session 的过程不承诺容器兜底必达。可信归属不可确认时拒绝 Docker 清理并保留 UNKNOWN，交维护者处理，不进行全局进程/项目匹配。

已核验内容：见 commands.json、runs/、source/、preservation.json 和 manifest.json。原失败、脚手架错误、第一次门禁cwd污染、第二次watchdog失败及Docker未运行失败单独登记；后续通过与其分开。原证据与已有 M1 包保留，未将 mock/合成 token 计入真实用量。开发 input/output/合计均 UNKNOWN；本轮新增付费模型调用0。