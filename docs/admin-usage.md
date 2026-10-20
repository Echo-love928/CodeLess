# 基础运营后台（D17-B）

管理员登录后直接打开 `/admin`。页面每次进入都通过已有的
`GET /api/v0/auth/me` 和 `GET /api/v0/admin/session` 复核身份；普通用户退回应用页，
服务端拒绝仍为最终权限依据。角色撤销、账号切换或接口返回 401/403 会清除管理数据。

**集成状态：D17-A 尚未完成（用户于 2026-10-20 确认）。** 只有身份检查已有正式契约。
以下数据路径和 DTO 是本卡的待议适配器，不能当作已有后台能力。
真实服务缺少列表/指标时，页面明确显示“管理数据接口尚未接入”，不填充演示数据或零。
`tests/e2e/admin/fixture.ts` 只在测试中拦截网络，生产代码没有 fixture 注入或本地管理员开关。

## 使用

- 任务、应用、部署为主表；用户、模型调用提供只读简洁查看。统一复用 `AdminTable.vue`。
- 输入所有者 UUID、开始/结束本地时间和资源状态后点击“应用筛选”。时间转换为 UTC，
  起点包含、终点不包含。切换资源清除状态筛选、保留已应用的所有者/时间，页码归零。
  编辑但未应用的条件不会用于分页。页面列出已应用条件。
- 每页 10/20/50 条。API 页码从 0 开始，界面从 1 开始；分页与总数全部由后台提供。
  约定按 `createdAt DESC, id DESC` 排序，不在当前页做搜索或排序。
- 表格时间按浏览器时区显示；唯一趋势视图按 UTC 创建日展示生成任务的各类结果数，
  缺少的日期不补零，文本同时提供每种结果计数，不依赖颜色读图。
- 成功率分别统计生成与部署：`成功 / (成功 + 失败)`。进行中、取消、未知不计入分母，
  各自数量仍展示；分母为零显示“暂无已知终态”。指标只使用所有者/时间条件，
  不受表格页码、资源状态影响。不能用生成成功率代替部署成功率。
- `null`/缺失的行用量、未知/新状态保留为未知；真实测得的 0 仍显示 0。
  汇总用量有缺失时显示“部分未知”，其数字必须由后台标注为完整总量或已知部分。
  本提案约定：任一调用缺少该项 usage，该汇总项为 `null`，不能把已知部分冒充完整总量。
- 指标加载失败不会遮挡已成功读取的表格。列表失败不显示“共 0 条”。
  新筛选/资源/页码的旧请求及旧账号的迟到响应均被丢弃。

## 取消操作

只有后台明确返回 `cancellable: true`，且任务处于 PLAN/GENERATE/VERIFY/REPAIR 时显示取消按钮。
点击后使用原生模态对话框展示固定任务 ID、应用 ID、读取时状态，并要求 1–500 字理由；
键盘焦点由浏览器限制在对话框内，提交期间不能关闭或重复提交。
`POST` 携带同源 Cookie 与现有 `X-CSRF-Token`，路径中的 ID 取自确认目标，不取当前选中行。

只有匹配目标的 `CANCELLED + auditId` 回执才显示“服务端确认已取消”。
`REQUESTED + auditId` 只表示受理；表格不做乐观改写，需手动刷新核对。
网络/服务/协议错误均显示目标、失败原因及“取消未获确认，结果未知”，表格仍可阅读。
提交前将目标 ID 写入当前账号的 sessionStorage；同一标签页刷新后仍禁止再次提交，
不自动重试，也不提供绕开未知结果的重试按钮。写入失败不会发出 POST。
sessionStorage 是浏览器重复点击保护，不代替后台幂等、事务审计或跨标签页并发控制。
后台应幂等处理已取消目标；任何管理员取消均必须记录真实操作者和理由。
需要维护者核对审计后处理遗留未确认目标；本卡不提供清除锁定的用户操作。

## 待 D17-A 对齐的接口提案

本分支没有修改共享 OpenAPI、数据库迁移、锁文件、CI 或后端。最终启用维护者需先确认
真实 DTO/分页/过滤/成功率口径，按正式契约调整 `features/admin/admin-api.ts`，
登记公共契约，再做真实 API + 浏览器联调。未确认前不能声称后台已启用。

| 请求 | 提案行为 |
| --- | --- |
| GET `/api/v0/admin/session` | **已有** `contracts/auth/README.md`；校验 ADMIN 且 ID 匹配当前会话。 |
| GET `/api/v0/admin/{tasks,applications,deployments,users,model-calls}` | **待议** 查询 `page=0&size=20`，可选 `ownerId`、`from`、`to`、`status`；users 不发状态。返回 `{items,page,size,total}`。 |
| GET `/api/v0/admin/metrics` | **待议** 只接受 `ownerId/from/to`，返回下述指标结构。 |
| POST `/api/v0/admin/tasks/{id}/cancel` | **待议** JSON `{reason}`；返回 `{taskId,status:"REQUESTED"或"CANCELLED",auditId:UUID}`。后台检查当前状态、CSRF、ADMIN，事务审计，拒绝不能取消的终态。 |

共同要求：匿名 401、普通用户 403（包括直接请求和不存在的管理资源）、错误体不包含秘密；
no-store；服务端分页/筛选后再计算 total；范围为空仍是合法空页。
UNKNOWN 状态筛选应匹配缺失及无法识别的状态，不把运行中、失败或缺失 usage 解释为成功。
ownerId 对任务/部署/模型调用指应用所有者；对 users 指用户 ID。
只返回必要元数据，不传口令、密钥、完整提示词/源码或 provider 原始载荷。

行字段：共同必需 `id:UUID, createdAt:RFC3339`。其他字段允许缺失/null，界面显示未知。

| 资源 | 展示字段 |
| --- | --- |
| tasks | applicationId, ownerId, status, failureCode, cancellable（缺省 false） |
| applications | name, ownerId, status |
| deployments | applicationId, versionId, ownerId, status |
| users | name, email, role（USER/ADMIN） |
| model-calls | taskId, model, status, inputTokens, outputTokens |

`Outcomes` 必须有五个非负整数：`succeeded, failed, pending, cancelled, unknown`。
生成 READY 为 succeeded，FAILED 为 failed，PLAN/GENERATE/VERIFY/REPAIR 为 pending；
部署 PUBLISHED 为 succeeded，FAILED 为 failed，REQUESTED 为 pending；其他归入 unknown，
取消必须依据真实后台取消状态。当前 v0 task schema 尚无 CANCELLED，不自行修改该 schema。

```json
{
  "generation": {"succeeded":3,"failed":1,"pending":0,"cancelled":0,"unknown":2},
  "deployment": {"succeeded":1,"failed":3,"pending":0,"cancelled":0,"unknown":0},
  "usage": {"inputTokens":null,"outputTokens":null,"unknownCalls":2},
  "trend": [{"day":"2026-10-20","generation":{"succeeded":3,"failed":1,"pending":0,"cancelled":0,"unknown":2}}]
}
```

趋势按 day 升序、不可重复，最多 366 天；超过范围应明确拒绝，不截断后冒充完整趋势。
指标字段缺失/负数/非法日期和分页元数据不匹配都作为接口错误，不做零值兜底。

## 验收复现

固定 Node 24.16.0 / pnpm 12.6.0 / Playwright 1.60.0，未新增依赖。

```powershell
node tests/e2e/admin/record-command.mjs unit
node tests/e2e/admin/record-command.mjs build
node tests/e2e/admin/record-command.mjs browser
node tests/e2e/admin/record-command.mjs static
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12.1'
node tests/e2e/admin/record-command.mjs api
node tests/e2e/admin/record-command.mjs auth-http
node tests/e2e/admin/record-command.mjs runner
node tests/e2e/admin/record-command.mjs e2e
```

记录器保留原日志、实际退出码/信号、起始 HEAD、工作树状态与源码 SHA-256；
日志在 `.local-data/d17-b/`。既有套件重写历史 evidence 时，先保留新产物到私有目录，
再恢复原字节，不把旧历史证据误提交到本卡。可移植摘要与截图在
`tests/e2e/admin/evidence/2026-10-20/`，阶段最终结果见 `docs/handoffs/D17-B.md`。

T1 浏览器 fixture 验证普通用户/服务端拒绝无法进入；`auth_http.py` 使用本轮 Maven
编译的类及 Surefire 记录的固定依赖（移除 test-classes），在独立临时 PostgreSQL 上启动
真实 Spring HTTP 服务。脚本覆盖全部管理读路径及取消POST的普通用户403，匿名401、
管理员session200和缺少列表404，并清理它创建的进程/容器。运行前需已有本轮
`AgentLoopIntegrationTest` 的 Surefire XML 以读取当前classpath；缺失即失败，不使用旧jar兜底。
T2 空记录/未知用量、T3 分页筛选/五类表格、T4 取消失败可读性均由真实 Chromium 操作证明，
**数据传输仍为命名 fixture，不证明 D17-A 筛选 SQL、指标聚合或取消审计已实现**。
