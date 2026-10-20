# D17-A 对 D17-B 的只读审查

审查对象：[PR #52](https://github.com/Echo-love928/CodeLess/pull/52)（draft，`codex/d17-b-admin` @`8c6de8b`，base `main` `e41c0e1`），2026-10-20。
方式：只读；临时 worktree `.local-data/rb17`（`8c6de8b`，node_modules 以 junction 指向主仓库），复现测试只放在该 worktree，未提交到 B 分支。
重点：非管理员无法进入且接口仍拒绝；空数据和未知用量不显示为零；筛选分页与后台口径一致；取消错误不影响表格可读性。

结论：**暂不批准（Request changes）**——1 项代码阻塞 + 1 项合并前置阻塞。

## 阻塞问题

1. **[P2] 成功率复核与后端舍入不一致，合法指标被判为“不符合约定”。**
   - 位置：`apps/web/src/features/admin/admin-api.ts` 的 `bucket()`：
     `const ratio = denominator ? Math.round(succeeded / denominator * 10000) / 10000 : null`，随后 `row.successRate !== ratio` → `invalid()`。
   - 后端口径（`AdminQueries.ratio`）是 `Math.round(n * 10000.0 / d) / 10000.0`。浮点运算顺序不同：57/800 时后端（jshell 实测）为 `0.0713`，
     客户端算出 `0.0712`；113/800 为 `0.1413` 对 `0.1412`。分母 ≤1000 时有 21 组、≤5000 时有 222 组这样的不一致（最小分母 800）。
   - 影响：窗口内终态任务（或发布）达到这些组合时，`getMetrics` 必然抛出“管理接口响应不符合约定”，整个指标区显示“指标不可用”，展开趋势的对应日同样失败；数据本身是正确的。
   - 复现：在 `8c6de8b` 的 `apps/web/src/features/admin/` 放入下述测试，`./node_modules/.bin/vitest run src/features/admin/review-d17a-rounding.test.ts`
     → `1 failed | 1 passed`，exit 1（对照组 3/4=0.75 通过；57/800 被拒，错误为“管理接口响应不符合约定”）。测试要点：
     以与后端相同形状的 `/metrics` 响应（`generation.total=800, ready=57, failed=743, denominator=800, successRate=0.0713`）调用 `getMetrics`，期望 resolve。
   - 修复方向：与后端同顺序计算（`Math.round(succeeded * 10000 / denominator) / 10000`），或不做浮点相等：校验 `denominator`、`null ⇔ denominator=0`，
     并允许 `Math.abs(successRate - succeeded / denominator) <= 0.00005`；补 57/800 用例。部署卡片同一函数，一并覆盖。

2. **[合并前置] PR #52 携带的 D17-A 副本是 `50d0044`，包含你在 #51 发现的两项阻塞问题。**
   - `chore(admin): import verified D17-A candidate 50d0044` 引入的 `AdminRedaction.java`、`AdminIntegrationTest.java` 与 `50d0044` 完全相同，
     即仍会把 `Authorization: Bearer demoTok123` 脱敏成 `Authorization: [REDACTED] demoTok123`，测试仍可能移动已配置的审计目录。
   - D17-A 已在 `codex/d17-a-admin-api` 修复（P1、P2 与建议用例，提交见 #51）。#52 需改为引入修复后的 D17-A HEAD，或待 #51 合并后 rebase；
     否则无论先合哪一个，都会在这些文件上冲突，处理不当会把修复覆盖回去。`contracts/admin` 未变，你登记进 `openapi.v0.json` 的片段仍有效。

## 建议（非阻塞）

1. **取消错误的语义**（`AdminPage.vue` `confirmCancel()`）：`block()` 在 POST 前把任务写入 sessionStorage，任何错误都提示“取消未获确认，结果未知……勿重复提交”，该行按钮永久变为“已提交 / 待核对”。
   但 503 `ADMIN_AUDIT_UNAVAILABLE`（契约：任务未被改动）、404、400、403 的结果是确定的“未取消”；接口幂等（重复取消返回 200/ALREADY_TERMINAL），重试安全。
   建议只对网络错误/超时保留“结果未知”与锁定，对确定性失败给出“未取消（原因）”并允许重试。表格可读性本身没有受影响。
2. **“未知 0”是前端生成的零**：`bucket()` 固定返回 `unknown: 0`，`AdminMetrics.vue` 在生成/部署卡片显示“未知 {{ value.unknown }}”，永远是“未知 0”。
   后端没有这个桶（INTERRUPTED 计入失败），显示 0 会让人以为“没有结果未知的任务”。建议删除该字段，或改写为“结果未知（INTERRUPTED）计入失败”。
3. 文案：`statusLabel` 没有 `NOT_FOUND`，审计列表显示“未知 · NOT_FOUND”；非失败任务的 `failureCode: null` 显示“未知 / 未提供”，实际是“不适用”。
4. 证据：`tests/e2e/admin/evidence/2026-10-20/integration/summary.json` 写着 `remoteCiGate: NOT_RUN`，但 #52 @`8c6de8b` 远端六项检查（含 ci-gate）已全部 success，请更新。
   两项本机失败可按 D16 做法在同环境对未改动 main 单独运行归因：`PreviewPlatformIntegrationTest` 在 D17-A 单独候选的本机 verify:api 中通过；
   截图清理用例是 D16 审查记录过的 Windows taskkill 竞态。

## 已核验内容

- **非管理员**：`routes.ts` `beforeEnter` 先看本地角色，再调 `GET /admin/session` 并核对 id；`admin-api.ts` 每次请求前 `requireAdmin()`，服务端仍独立 401/403（D17-A T1 真实 HTTP 证据）；
  401 清会话转登录，403 清空数据转 `/apps`；账号身份变化时 `purge()`，不跨账号保留数据。B 单测覆盖“普通/过期会话不发请求”“服务器角色与当前账号核对”。
- **空数据/未知**：`successRate: null` 显示“暂无已知终态”，不是 0%；`tokens.complete=false` 显示“未知”与“≥ 已知下限”；单条 `null` 用量显示“未知 / 未提供”，实测 0 保持 0。
- **筛选分页**：状态/结果/用量枚举与后端一致；ownerId 仅任务、应用；from/to 仅任务、部署、模型调用与指标（界面已说明）；`from >= to` 前端先拦截；
  分页按服务端 `totalItems/totalPages`，并校验当页条数，size 10/20/50 ≤ 100。
- **取消**：理由 1–200 码点、无控制/格式字符、带 CSRF；响应核对目标与操作者一致、CANCELLED ⇒ FAILED/CANCELLED；失败时保留表格并以 `role=alert` 提示，成功后用服务端 `task` 替换该行。
- **范围**：B 改动 `apps/web`（admin 功能 + 路由一行）、`tests/e2e/admin`、文档、`contracts/openapi.v0.json`（登记 D17-A 片段，测试改为必须相等）、`scripts/run-static.mjs`（登记 D17-A 契约测试）；
  未改 CI、迁移、锁文件。对 `tests/admin/contracts.test.mjs`/`validate-contract.mjs` 的修改是加强（注册后必须一致），不是削弱。
- **秘密**：非证据文件只有合成值（`csrf`、`*.example.test`、Schema 文案）；live harness 用固定参数、无 shell，只结束自身子进程树。
- **验证**：worktree @`8c6de8b` 运行 B 的 admin 单测 3 文件 17/17，exit 0；上述复现 exit 1；远端 #52 @`8c6de8b` 六项检查 success。
  未重跑 B 的真实浏览器联调与整仓门禁（本轮只审查与复现）。

作者修复后，我只复查 `admin-api.ts`/相关测试的变更、重新引入的 D17-A 版本与新 HEAD 的检查。
