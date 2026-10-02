# D06｜A/B 集成、公共契约与结构化详情

日期：2026-10-02（Asia/Shanghai）。任务分支 `codex/d06-contract-integration`；基线 main `944738c3c4f035f3d503281fecba9f96a09fdf88`；候选为本文件所在任务分支 HEAD。

## 授权与来源

用户确认 A 默认批准 B `7a13317`，要求继续完成待办；随后明确选择“同时新增结构化接口、持久化与展示；真实生成链路仍另行开发”。本轮据此集中维护共享 OpenAPI、契约门禁及 V4 迁移，原 A/B 任务分支保留，main 不修改。

已获取 origin/main、A `71e1cb70a038f1b7594fdc7894a5437c0c579223`（PR #12）、B `7a13317928860164e8f861f10de26d9e99bc2adc`（PR #13）。在新分支先快进 A，再合并 B，无冲突，集成基点 `2fd0d5b709530fd39ef905f06b48603aa5aeb318`。A/B 原交接记录及首次失败证据保留；原未跟踪 `.idea/` 保留。

A 对 B 修复的互审结论已读取，原 P1 解除。用户批准记录来自本聊天；没有以作者身份伪造 GitHub approval。新增集成/详情改动与旧 B 候选有差异，应审查本轮最终提交，旧批准不能证明新代码已审。

## 完成内容

- `contracts/openapi.v0.json`：采用 A 的 events 补丁，同步 JSON/SSE、Last-Event-ID、分页、错误、心跳、终态；同时同步 D05 的 Idempotency-Key、冲突 409 和 CSRF/所有权保护的 cancel。
- `scripts/run-static.mjs`：正式执行 events/tasks 契约测试。events 测试检查公共源文件，不再仅检查可能掩盖缺失公共接口的组合预览。`validate-contracts.mjs` 纳入新 diagnostics 正反 fixture。公开契约缺口在本集成候选中关闭，仍须通过 PR 合入才会进入 main。
- `task-diagnostics.schema.json`：独立结构化详情响应，保持已有 v0 Event 形状及固定脱敏摘要。区分无生产者结果、已确认无变更和实际变更；新增/修改/删除包含受限相对路径及前后 SHA-256，不返回原源码/逐行 diff。
- `TaskDiagnosticsService` / V4：记录完整文件快照，最多 40 个唯一路径；内部写入口校验任务行锁、活跃租约、GENERATE/REPAIR、预期 revision 和路径/摘要，快照与 TOOL_RESULT 同事务提交。取消、过期、陈旧 revision 或并发败者无部分写入。构建详情读取现有 builds 表，最多 100 条；不暴露 log_url、原工具日志、owner 或 lease。
- `GET /api/v0/tasks/{taskId}/diagnostics`：Cookie 鉴权、所有权（ADMIN 也不能跨用户读取）、活动账号、一致数据库快照、no-store。无公共写端点；异常或溢出返回失败，不冒充完整数据。
- 工作台：展示新增/修改/删除、前后摘要、构建/版本 ID、状态、退出码、制品摘要及时间；缺少结果不等于成功。恢复、刷新、状态/事件读取及取消后重读；旧请求/任务/订阅回调不能污染新任务。详情读取失败保持权威任务状态并显示可重试错误。

这是文件差异**元数据**与构建详情的读写/展示边界，不是源码逐行差异、模型或真实生成执行链。未来 TaskStageRunner/受控生产者需调用 `recordFiles` 并持久化实际 worker 构建结果；当前默认执行器仍会明确返回 RUNNER_UNAVAILABLE。

## 验证与复现

环境沿用锁定 Node 24.16.0、pnpm 12.6.0、Java 21.0.12.1、Maven Wrapper 3.9.11、PostgreSQL 17.6 固定摘要、已安装 Chrome。设置仅影响当前测试进程：

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21.0.12.1'
$env:Path="$pwd\.local-data\d06-b\bin;E:\nodejs;$env:JAVA_HOME\bin;$env:Path"
$env:CODELESS_PLAYWRIGHT_CHANNEL='chrome'
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY -ErrorAction SilentlyContinue
pnpm ci:gate
tests/e2e/events/run-live.ps1 -ApiJar services/api/target/codeless-api-0.0.0-SNAPSHOT.jar
```

定向 `services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=TaskDiagnosticsTest' test` 退出 0、5/5、0 skipped；`.local-data/d06-integration/diagnostics-api.log`。覆盖持久化/事件原子性、已知空快照、陈旧 revision、取消/过期/错误 lease、路径/摘要/重复/超量拒绝、两个并发生产者只能提交一个结果、HTTP 所有权/匿名/非法 UUID/禁写、原日志 URL 排除和损坏快照失败。实际使用 PostgreSQL；构建行明确为确定性数据库 fixture，不证明真实 build worker 执行。

原始失败保留：新 schema 的条件分支缺少显式类型，被 Ajv strictTypes 拒绝；补齐类型后同一断言通过。首轮完整 `.local-data/d06-integration/ci-gate.log` 退出 1，仅旧 `DataIntegrationTest` 硬编码 3 个迁移失败（实际 V4）；同期契约 7/7、单测 24/24、runner 14/14、浏览器 27/27 通过。修复断言为 4，并在表存在检查中加入 task_file_snapshots（9 表）；没有删除失败路径、跳过检查或循环重试掩盖产品错误。

真实联调首次 `.local-data/d06-integration/live.log` 在加载测试时退出 1：Playwright 的 CommonJS 转换与新增 import.meta 冲突。改用 exec 工作目录解析模板路径后进入实际浏览器验收，第二次 `.local-data/d06-integration/live-final.log` 退出 1：服务端默认 NON_NULL 序列化省略契约必需的 beforeDigest / artifactDigest，前端严格校验拒绝响应。为详情 DTO 显式指定 ALWAYS，并在 HTTP 回归中要求排队/失败记录包含 null 字段；前端和 schema 校验保持不变。后续最终日志独立保留，不覆盖这两次失败。

最终 `pnpm ci:gate` 退出 0：公共契约 7/7、前端单测 24/24、API 51/51（0 skipped）、runner 14/14、浏览器 27/27；lint、类型检查、打包和 OpenAPI lint 均通过。证据 `.local-data/d06-integration/ci-gate-verified.log`。

修复后的真实 API + PostgreSQL + Chrome 联调退出 0，1/1：`.local-data/d06-integration/live-verified.log`；任务 `318d8d19-ac21-4981-aaf2-fea9bcfe9493`，重连游标 `1,3,3`，取消后数据库 `FAILED/CANCELLED/4`。模板文件真实 SHA-256 与明确标注的 FAILED/exit 2 构建行作为确定性 fixture 持久化；浏览器断网补齐、刷新和关闭再进入均显示详情，未暴露私有日志 URL，终态无后续订阅。截图 `.local-data/d06-b/live-cancelled.png` 已查看，详情及摘要正常换行。临时 8080/15436/5173/4173 监听和本次标记容器均已清理。

精确最终提交的远端状态以本集成 PR Checks 为准；不能用旧 A/B 的检查结果代替本轮候选。

## 待接手与限制

真实生成/worker 编排按用户决定另行开发；本轮没有模型凭据依赖，平台模型调用 0。生产者可使用内部租约接口写入实际文件快照；不允许前端提交构建成功或原工具文本。实际网关缓冲、慢客户端、socket/write 超时部署验证继续遵循 events README 的矩阵，本轮不以直接 Tomcat/fixture 证明部署能力。未提供生产部署有效配置，未修改 infra。

本集成 PR 不自动发布、不自批、不合并或直接推送 main；根锁和 CI workflow 不修改。schema、迁移和公共契约改动在本集成分支集中完成。

开发 input_tokens / output_tokens / 合计：未知 / 未知 / 未知，计量来源未知。平台模型用量单列：0 requests、0 input tokens、0 output tokens；所有生成阶段和详情验收 fixture 明确确定性。
