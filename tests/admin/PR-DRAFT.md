任务ID：D17-A（成员A）｜基础管理 API 与真实指标

## 问题与结果

- 触发场景：受控试用需要一个最小后台查看用户/应用/任务/部署/模型调用，并给出可信的生成成功率、部署成功率、修复次数与实际 token；运行中的任务需要管理员可取消且留痕。
- 修复前：除 `GET /admin/session` 外没有管理接口；没有统一的指标口径；管理员无法取消他人任务。另外，`AuthFilter` 的管理前缀按原始 URI 判断，`/api/v0/%61dmin/session` 让普通用户拿到 200。
- 修复后：6 个只读列表 + 指标 + 唯一的写操作“审计取消”；生成与部署成功率分母独立、分母 0 为 `null`、未知用量不当 0；提示词永不返回；编码路径同样 403。

## 范围

- 新增 `services/api/.../admin/`（`AdminController`、`AdminQueries`、`AdminTaskCancellation`、`AdminAuditLog`、`AdminRedaction`）。
- 小改：`TaskQueueService.cancelAsAdministrator`（复用所有者取消的同一转换）；`AuthFilter` 管理前缀也按解码路由路径判断（+3 行）；`AuthController.adminSession` 处理方法内查角色。
- 契约：新增 `contracts/admin/`（`README.md` 含指标口径、`admin.schema.json`、`openapi.patch.json`）。共享 `openapi.v0.json`、`scripts/run-static.mjs`、迁移、CI、根锁均未改。
- 子项：D17-A-01 列表、02 指标、03 取消 + 审计、04 脱敏。

## 验证（Windows 11 / Temurin 21.0.12.1 / Maven 3.9.11 Wrapper / Node 24.16.0 / pnpm 12.6.0 / Docker 29.8.2 / PostgreSQL 17.6 Testcontainers；模型 deterministic-mock）

| 命令 | 提交 | 退出码 | 结果 |
| --- | --- | --- | --- |
| `node tests/admin/record-command.mjs acceptance` | `6eddcf5` | 0 | 10/10：AdminIntegrationTest 5（T1–T4 + 04，真实 HTTP + PostgreSQL）、AdminAuditLogTest 3、AdminRedactionTest 2 |
| `node tests/admin/record-command.mjs regression` | 实现候选（未提交，已记录文件摘要） | 0 | 25/25：Auth×2、TaskHttp、TaskQueue、TaskDiagnostics、ApplicationIntegration |
| `node tests/admin/record-command.mjs contracts` | `2a485f7`+守卫修复 | 0 | 契约 4/4；私有组合 OpenAPI Redocly 有效，唯一 warning 与未改动共享文件相同 |
| `pnpm verify:static` | `2a485f7` | 0 | |
| `pnpm verify:runner` | `2a485f7` | 0 | |
| `pnpm verify:e2e` | `2a485f7` | 0 | |
| `pnpm verify:api` | `2a485f7` | 1 | VersionHttpIntegrationTest 5 error（`too many clients already`，本 PR 新增测试上下文导致，已在 `6eddcf5` 修复）+ PreviewAcceptanceProcessTest 5 failure（既有 Windows 本机问题） |
| `pnpm verify:api` | `6eddcf5` | 1 | 266 项：0 error，5 failure 全部为 `PreviewAcceptanceProcessTest`；未改动的 base `e41c0e1` 同环境单独运行同样 8 项 5 failure、失败名相同（`gate-attribution.json`）。本机 ci-gate 因此未全绿，以 PR 远端检查为准 |

D17-B 互审修复（`b67ee32`）：P1 `Authorization: Bearer …` 整值脱敏、P2 测试审计目录强制隔离、新增“完成记录丢失 → UNKNOWN”用例。
`acceptance` 0（12/12）、`contracts` 0、`verify:api` 1（268 项，仅既有 5 项 `PreviewAcceptanceProcessTest`）。修复前红测与 canary 复现见交接。

证据：`tests/admin/evidence/2026-10-20/`（T1–T4、04 的真实响应 JSON 与全部运行摘要 `commands.json`；原始日志与 JUnit 在私有 `.local-data/d17-a/runs/`，以摘要标识）。
变异自检：去掉控制器 `requireAdmin` / 把取消计入生成分母 / 把部分用量当精确总量，T1、T3、T4 分别失败（`.local-data/d17-a/mutation-run.log`）。

## 失败路径

- 权限：匿名 401、普通用户 403（含 `%61dmin`、`admin;x=1` 等写法）、管理员缺 CSRF 403；管理员访问他人任务的所有者接口仍 404。
- 非法输入：未知/重复/空参数、越界分页、非枚举值、非规范 UUID、无时区时间、`from >= to` → 400；取消理由空/超长/控制字符/多字段 → 400 且不审计。
- 取消：先落盘审计意图，写不进去 503 且任务不变；重复取消 200/ALREADY_TERMINAL、无新事件；不存在 404 且审计 NOT_FOUND；结果记录丢失为 UNKNOWN；被取消任务的旧租约无法再写。
- 未知值：分母 0 → `null`；未知/部分用量不进入精确总量；审计账本损坏 → 503 而非空列表。

## 模型来源

确定性替身（deterministic-mock）；本卡验收不调用模型（模型调用记录为数据库 fixture，含真实可能出现的 null/部分/0 用量）。无真实模型效果报告。

## 数据与配置

- 无迁移。审计为私有只追加账本：`codeless.admin.audit-root`（`CODELESS_ADMIN_AUDIT_ROOT`），默认 `${codeless.agent.private-root}/admin-audit`；生产需私有持久卷与备份。建议维护者后续登记 `admin_audit_events` 表（README 给出字段与索引）。
- 回退：回滚本 PR 即可，无数据结构变化；账本目录可保留。

## 剩余事项

- 维护者：共享 OpenAPI 登记 `contracts/admin/openapi.patch.json`（含 `admin` tag）、`scripts/run-static.mjs` 登记 `tests/admin/contracts.test.mjs`。
- D17-B 页面联调与 M3 集成验收由最后启用 PR 承担；本卡未宣称完成。
- 审计账本假定单 API 实例（与 D15 部署账本相同）。

## 审查者 / 合并条件

另一名成员审查，作者不自批。最新 main 组合通过全部必需检查（ci-gate=success）、真实报告存在、无未解决阻塞讨论、同伴批准后才可合并。
