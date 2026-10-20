# 基础运营后台（D17 A/B 已接线）

管理员登录后打开 `/admin`。前端按 `contracts/admin/README.md` 与
`admin.schema.json` 调用真实 API；进入时复核 `/auth/me` 和 `/admin/session`，
各管理接口仍由后端独立鉴权。普通用户无法进入，401/403 会清除管理数据。

## 查看与筛选

任务、应用、部署为主表；用户、模型调用与取消审计为简洁只读表，统一复用表格。
分页全部由服务端决定：请求页码从 0 开始，响应使用 `totalItems/totalPages`，界面从第 1 页开始。
排序固定为创建时间降序、ID 降序，审计按 requestedAt 降序。

| 页面控制 | 实际发送到后台的范围 |
| --- | --- |
| 所有者 ID | 仅任务、应用；UUID 精确匹配 |
| 开始/结束时间 | 指标、任务、部署、模型调用；本地时间转换为带时区 UTC，区间 `[from,to)` |
| 记录状态 | 当前资源正式枚举；审计发送 `outcome`，其余发送 `status` |
| 任务结果 | 仅任务；ACTIVE/READY/FAILED/CANCELLED，对应服务端 `outcome` |
| 用量状态 | 仅模型调用；KNOWN/UNKNOWN/PENDING |
| 邮箱或显示名 | 仅用户；服务端字面子串查询 `q` |
| 审计目标 ID | 仅审计；UUID 精确匹配 `targetId` |

用户、应用、审计列表不支持时间筛选，页面明确说明；时间仍约束上方指标。
指标不接受 ownerId 或表格状态，不能把筛选后的某一页当成全局指标。
编辑条件后点击“应用筛选”生效，分页沿用已应用条件；切换资源清除不支持的条件。
新资源/页码、账号或权限发生改变时，迟到响应不能覆盖当前页面。

## 指标与未知值

- 生成：后端分母 READY + 非取消 FAILED；INTERRUPTED 计入失败，取消和进行中另列。
- 部署：只统计 publications，分母 PUBLISHED + FAILED，REQUESTED 另列。
- 页面验证分桶、分母和后端四位小数比率一致，再展示百分比。分母 0 且后端 rate=null
  显示“暂无已知终态”，不显示 0% 或 100%。两类成功率不混用。
- 模型精确用量仅在 `tokens.complete=true` 时为数值；否则显示未知和已知调用的用量下限。
  UNKNOWN 与 PENDING 分别计数，真实测得的 0 仍是 0；单条部分用量只显示已知的一半。
- 修复轮数、发生修复的任务数与修复后成功任务数来自真实指标。
- 唯一趋势视图展开后，分别读取最近最多 7 个 UTC 日的真实指标窗口，并与所选时间范围取交集。
  各日数据来自独立读取，页面提示可能存在读取时差。没有虚构趋势接口或从当前页外推总数。
- 指标失败不遮挡已读表格；列表错误不伪装成空表或“共 0 条”。

## 取消与审计

仅 `cancellable=true` 且处于 PLAN/GENERATE/VERIFY/REPAIR 的任务提供取消按钮。
确认框固定展示任务 ID、应用 ID、读取时状态；理由需 1–200 字、不含控制字符。
POST 使用同源 Cookie 和现有 CSRF token，无开放 shell 或批量操作。

正式回执为 `{task,audit}`。前端核对 task.id、audit.targetId、audit.actorId、审计 ID、动作和时间；
CANCELLED 还必须与任务 FAILED/CANCELLED、cancellable=false、审计 resultingStatus=FAILED 一致。
只有匹配回执才显示成功并用服务端 task 更新原行。
ALREADY_TERMINAL 显示“已经终止”，不声称再次取消；UNKNOWN/FAILED 等审计结果保持未知/错误。
网络/协议/503 失败不改原行、不自动重试。

提交前持久保存当前账号与目标 ID 的浏览器重复点击保护，同标签页刷新后仍不能盲目重发。
它不是跨标签页幂等或后台事务机制。需要维护者核对审计后处理未确认目标。
审计列表可以按目标和结果查询；理由使用服务端脱敏文本，并以 Vue 文本渲染。

后端先强制落盘意图，再事务取消、清租约并写结果。审计不可用时 503，任务不变；
重复取消返回 ALREADY_TERMINAL，不追加任务事件。丢失结果记录为 UNKNOWN。
审计账本是 `CODELESS_ADMIN_AUDIT_ROOT` 指定的私有持久目录，需持久卷与备份；当前只支持单 API 实例。
生产账本不得挂载到生成代码容器。本次没有新增迁移或放宽隔离。

## 本地验收

固定 Node 24.16.0、pnpm 12.6.0、Java 21.0.12.1、Playwright 1.60.0。

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12.1'
$env:CODELESS_ADMIN_INTEGRATION = '1'
node tests/admin/record-command.mjs acceptance
node tests/e2e/admin/record-command.mjs static
node tests/e2e/admin/record-command.mjs live
node tests/e2e/admin/record-command.mjs browser
```

`live_harness.py` 从当前 Maven 编译类和 AdminIntegrationTest 的固定 classpath 启动真实 Spring，
排除 test-classes，使用专用临时 PostgreSQL 与生产构建预览。先执行
`tests/e2e/admin/seed-live.sql` 写入显式测试记录，再运行真实 Chromium，无 page.route 或 Mock HTTP。
覆盖权限、分页/结果/用量筛选、六类列表、空窗口、趋势、真实审计目录不可写、管理员取消及重复取消。
最后检查 SQL：FAILED/CANCELLED、FINISHED、租约清空、事件恰一条；核对只追加的四个审计文件，
随后清理本脚本创建的进程与容器。SQL 记录不是实际模型调用，不作为模型效果或付费用量证明。

契约 fixture 回归与真实联调分开保存。原始日志在 `.local-data/d17-b/integration/`；
命令、退出码、源码摘要、真实响应、SQL/审计核验及截图见
`tests/e2e/admin/evidence/2026-10-20/integration/`，最终门禁状态见 `docs/handoffs/D17-B.md`。
