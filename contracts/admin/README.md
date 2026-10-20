# D17-A 基础管理 API 与指标口径

状态：D17-A 提交的独立契约。共享 `contracts/openapi.v0.json` 由维护者登记；登记后必须与
[`openapi.patch.json`](openapi.patch.json) 完全一致。响应与请求形状：[`admin.schema.json`](admin.schema.json)（JSON Schema 2020-12）。

范围：受控试用的最小后台——只读列表、指标、唯一的写操作“取消任务”及其审计。
不建设企业权限平台（无细分角色、无批量操作、无删除/编辑、无用户管理写入）。

## 鉴权

- 全部路径在 `/api/v0/admin/` 下，仅 `ADMIN` 角色可用：匿名 `401 UNAUTHENTICATED`，普通用户 `403 FORBIDDEN`。
- 双重检查：`AuthFilter` 按原始 URI **和** Spring 实际路由所用的解码路径（去掉 `;参数`）判断管理前缀；
  每个处理方法再调用 `OwnershipGuard.requireAdmin`。`/api/v0/%61dmin/...`、`/api/v0/admin;x=1/...` 等写法对普通用户同样是 403。
- 管理员身份不扩大所有者接口：管理员访问他人任务的 `/api/v0/tasks/{id}`、`/cancel` 仍是 404。
- 写请求（取消）需要 `X-CSRF-Token`，缺失为 `403 CSRF_INVALID`。
- 所有成功响应 `Cache-Control: no-store`。

## 列表接口（只读）

| 路径 | 可用筛选 |
| --- | --- |
| `GET /admin/users` | `role`=USER\|ADMIN，`status`=ACTIVE\|DISABLED，`q`（邮箱或显示名的字面子串，不区分大小写，1..100） |
| `GET /admin/applications` | `ownerId`，`status`=ACTIVE\|ARCHIVED，`dataMode`=STATIC\|MOCK\|LOCAL_STORAGE |
| `GET /admin/tasks` | `status`（6 个任务状态），`outcome`=ACTIVE\|READY\|FAILED\|CANCELLED，`kind`=GENERATION\|EDIT，`applicationId`，`ownerId`，`from`，`to` |
| `GET /admin/deployments` | `status`=REQUESTED\|PUBLISHED\|FAILED，`applicationId`，`from`，`to` |
| `GET /admin/model-calls` | `status`=REQUESTED\|SUCCEEDED\|FAILED，`stage`=PLAN\|GENERATE\|REPAIR，`usage`=KNOWN\|UNKNOWN\|PENDING，`taskId`，`from`，`to` |
| `GET /admin/audit` | `action`=TASK_CANCEL，`actorId`，`targetId`，`outcome` |

分页：`page` 从 0 开始（0..10000，默认 0），`size` 1..100（默认 20）。响应 `{items, page, size, totalItems, totalPages}`，
`totalPages = ceil(totalItems / size)`；越过末页返回空 `items` 与真实 `totalItems`。排序固定为 `createdAt DESC, id DESC`
（审计按 `requestedAt DESC, id DESC`），同一时间戳由 id 决定先后，翻页不重不漏。每个响应的计数与当页来自同一 REPEATABLE READ 快照。

严格参数：未知参数（如拼错的 `stauts`）、重复参数、空值、非规范 UUID、非枚举值、`size` 越界、无时区的时间、`from >= to`
一律 `400 INVALID_REQUEST`，不会“忽略筛选返回全部”。筛选之间为 AND。

`from`/`to`：RFC 3339 带时区，按各资源自己的 `createdAt` 过滤，区间 `[from, to)`。

## 指标 `GET /admin/metrics?from=&to=`

窗口参数同上（可省略为全部时间）。三个总体互不混用，各自按自己的 `createdAt` 入窗：
任务（`generation_tasks`）、发布记录（`publications`）、模型调用（`model_calls`）。

### 生成成功率 `generation`

- 总体：窗口内全部任务；`byKind` 把它拆为 `GENERATION`（初次生成）与 `EDIT`（D12 对话/可视化修改，
  由服务端写入的首个事件判定，不解析提示词）。
- 分桶（与 `/admin/tasks?outcome=` 使用同一 SQL 条件，计数必然一致）：
  - `ready`：状态 READY。
  - `failed`：状态 FAILED 且 `failureCode != CANCELLED`。**包括 `INTERRUPTED`（超时/结果未知）**——未知结果不算成功。
  - `cancelled`：FAILED/CANCELLED（用户或管理员主动取消），不计入分母。
  - `active`：PLAN/GENERATE/VERIFY/REPAIR，尚无结论，不计入分母。
- **分母** `denominator = ready + failed`；`successRate = ready / denominator`，四舍五入 4 位小数。
- 分母为 0 时 `successRate: null`（无数据），绝不显示 0% 或 100%。

### 部署成功率 `deployment`

- 总体：窗口内的发布记录（publications，即 D15 部署请求），与任务无关；READY 但未发布的任务不进入此指标。
- `published`：PUBLISHED；`failed`：FAILED；`inProgress`：REQUESTED（不计入分母）。
- **分母** `denominator = published + failed`；`successRate = published / denominator`；分母 0 → `null`。
- 状态取 PostgreSQL publications 终态真值（D15 约定），不读私有阶段账本，不把 UNKNOWN 阶段改成成功。

### 修复次数 `repairs`

- `total`：窗口内全部任务 `repairAttempts` 之和（每进入一次 REPAIR 计 1，单任务上限 3；含进行中任务已发生的修复）。
- `tasksWithRepairs`：`repairAttempts > 0` 的任务数；`readyAfterRepair`：其中最终 READY 的任务数。
- **分母** `denominator` = 窗口内全部任务数；`averagePerTask = total / denominator`（4 位小数），分母 0 → `null`。

### 实际 token `tokens`

- 只统计 provider 实际回报的 `input_tokens`/`output_tokens`；AgentModel 运行时预算中的保守预留（charged）不是实际用量，不计入。
- 每次调用的 `usage`：`PENDING`（REQUESTED，尚未结束）、`KNOWN`（已结束且输入、输出都有值；provider 真实回报的 0 就是 0）、
  `UNKNOWN`（已结束但任一值缺失，含只回报了一半的调用）。失败调用若有回报同样是真实消耗，计入。
- `knownCalls/unknownCalls/pendingCalls` 合计等于 `calls`。`knownInputTokens/knownOutputTokens/knownTotalTokens` 只对 KNOWN 调用求和（下限）。
- **精确总量** `inputTokens/outputTokens/totalTokens` 仅当 `complete = (calls == knownCalls)` 时给出数值，否则为 `null`；
  窗口内没有任何调用时 `complete=true`、总量为 0（确实没有消耗）。
- 列表中 UNKNOWN 调用的 `totalTokens` 为 `null`，已知的一半（如只有 `inputTokens`）原样显示，不推算另一半。

界面建议：`complete=false` 时显示“≥ knownTotalTokens（另有 N 次调用用量未知）”或“未知”，不得显示为精确值或 0。

## 取消任务 `POST /admin/tasks/{taskId}/cancel`

请求体 `{"reason": "..."}`：去首尾空白后 1..200 个码点，不允许控制/格式字符，不允许其他字段或查询参数。

处理顺序：
1. 写入审计意图（REQUESTED，强制落盘）。写不进去 → `503 ADMIN_AUDIT_UNAVAILABLE`，任务不受任何影响。
2. 事务内锁定任务行：非终态任务与所有者取消走同一转换，变为 `FAILED/CANCELLED`，追加事件
   `Task cancelled by administrator`（所有者可见，不含管理员身份或理由），清除租约，旧 worker 之后无法写入；
   READY/FAILED 任务保持不变；不存在 → `404 NOT_FOUND`。
3. 提交后写入结果记录：`CANCELLED`、`ALREADY_TERMINAL`、`NOT_FOUND` 或 `FAILED`（事务异常）。
   若结果记录写失败，响应与列表中该条为 `UNKNOWN`，以任务行为准，绝不当作成功。

响应 `200 {task, audit}`（重复取消同样 200，`audit.outcome = ALREADY_TERMINAL`，不产生新事件）。
400/401/403 的请求不执行、不审计。

## 审计记录

- 存储：私有只追加账本 `codeless.admin.audit-root`（可用环境变量 `CODELESS_ADMIN_AUDIT_ROOT` 覆盖；默认
  `${codeless.agent.private-root}/admin-audit`，本地 `.local-data/agent/admin-audit`）。每条两个不可变文件
  `{id}.requested.json` / `{id}.completed.json`，临时文件 + fsync + 原子移动；目录必须是真实目录（拒绝符号链接/junction）。
- 读取时任何无法解析、多余、孤立的完成记录都使整个审计列表 `503`，不静默丢条目。未完成移动的 `.pending-*` 视为不存在。
- 字段：`id, action, actorId, targetType, targetId, reason（已脱敏）, requestedAt, outcome, previousStatus, resultingStatus, completedAt`。
- 未新增数据库迁移：迁移编号由维护者统一分配（与 D07-A/D15-A 私有账本同一做法）。建议维护者后续登记
  `admin_audit_events` 表（字段同上，`id` 主键，`(target_id)`、`(requested_at DESC, id DESC)` 索引，仅 INSERT 权限），
  届时 API 形状不变。生产需要私有持久卷与备份；不得挂给生成代码容器。

## 脱敏（D17-A-04）

- 用户：不返回 `password_hash` 或任何凭据字段。
- 任务：**永不返回提示词**。只给 `promptLength`（码点数）和 `promptPreview`：先对全文做凭据脱敏（`key/token/password/secret… = 值`、
  中文“密码/密钥/口令/令牌”、Bearer、JWT、`sk-`/`ghp_`/AKIA/`xox?-`/AIza、PEM 私钥块、≥32 位的长串），再去掉控制/格式字符（含双向覆盖符），
  最后截取前 40 个码点加 `…`。先脱敏后截断，跨截断点的密钥也不会漏出前缀。
- 模型调用：只有 provider、model、阶段、状态、用量和错误码；不返回请求/响应正文、私有审计文件内容或密钥。
- 审计理由：写入前脱敏。部署：只有 SQL 字段（公开 URL），不含托管目录、主机路径或 SSH 信息。
- 脱敏是纵深防御，不是允许把密钥写进提示词的理由。

## 错误

沿用 `ApiError`：`400 INVALID_REQUEST`、`401 UNAUTHENTICATED`、`403 FORBIDDEN | CSRF_INVALID`、`404 NOT_FOUND`、
`503 ADMIN_AUDIT_UNAVAILABLE`。

## 给 D17-B（页面）的对接要点

- 进入后台前可调用 `GET /admin/session`；但每个接口仍独立拒绝，页面隐藏不是权限。
- `successRate: null` 显示“暂无数据（分母 0）”，并展示分子/分母；生成与部署两张卡片分开，不合并成一个“成功率”。
- `tokens.complete=false` 按上文显示“未知/下限”；单条调用 `usage=UNKNOWN` 显示“未知”，不显示 0。
- 指标下钻：`generation.ready` ↔ `/admin/tasks?outcome=READY&from&to`，`deployment.failed` ↔ `/admin/deployments?status=FAILED&from&to`，
  `tokens.unknownCalls` ↔ `/admin/model-calls?usage=UNKNOWN&from&to`，`totalItems` 与指标数相等。
- 取消按钮只对 `cancellable=true` 显示；必须填写理由；失败（403/404/503）只提示错误，保留表格数据；成功后以响应中的 `task` 更新该行。
