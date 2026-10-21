任务ID：D19-A（API 权限与输入边界专项）

问题与结果：

- 触发场景：`AuthFilter` 用原始 URI 判断是否属于 `/api/v0/`，Spring 却按解码、去掉 `;参数` 的路径路由；生产 nginx 以规范化 URI 匹配 `location ^~ /api/v0/`、按原始目标转发。
- 修复前：`POST /api;x=1/v0/auth/logout`（及 `/%61pi/v0/…`、`/api/%76%30/…`、`/api/v0;x=1/…`）不带 CSRF 令牌就登出受害者（204）；`POST /api;x=1/v0/auth/login` 不带令牌登录成功（200，登录 CSRF）；`GET /api;x=1/v0/auth/me` 500。登录限流先检查、BCrypt 之后才计数：24 个并发错误猜测有 17 个被真正比对（上限 5）。文本 NUL、缺少必填参数、错误媒体类型返回 500。
- 修复后：全部判断使用路由路径，非规范目标在 401/403 判断之后 400；会话 ID 只接受 Cookie；尝试在比对密码前原子预占（并发时最多 5 次比对）；上述输入为 400/415/406。

- 范围：`services/api/**`（`auth/AuthFilter`、`auth/AuthController`、`auth/LoginAttempts`、`error/GlobalExceptionHandler`、`application.yml` 会话追踪方式）；新测试 `services/api/src/test/java/dev/codeless/api/security/**`；`tests/security/api/**`（记录器、证据导出、证据、互审记录）；`docs/security-api.md`；`docs/handoffs/D19-A.md`。未改 `contracts/`、根脚本、CI、锁文件、迁移、前端或 runner。子项 D19-A-01..04 全部覆盖。
- 验证：见 `docs/handoffs/D19-A.md` 第 3、4 节与 `tests/security/api/evidence/2026-10-21/commands.json`（命令、HEAD、退出码、日志摘要）。`ApiSecurityMatrixTest` 7/7；6 个反证运行各自只让预期用例失败并按字节恢复；回归 15 个套件；完整 `ci-gate` 结果以交接记录为准。
- 失败路径：跨用户（25 个所有者路由 + 6 个交叉引用，与随机 ID 逐字节相同的 404）、CSRF（5 种坏令牌、查询串令牌、13 种路径写法、URL 会话 ID、CORS、方法伪装）、登录限流（写法变体、并发）、字段长度、幂等键、非法发布/生成/修改/源码路径、日志与账本中的秘密。
- 模型来源：确定性替身 `deterministic-mock`；本专项不调用模型，不作为模型效果证据。
- 数据与配置：无迁移、无新环境变量。新增 `server.servlet.session.tracking-modes: cookie`。回退方式：还原上述 5 个文件即可（测试会失败，这是预期）。
- 契约差异（交维护者，本 PR 未改 `contracts/`）：非规范 `/api/**`、`/internal/**` 目标 400 `INVALID_REQUEST`；415 `UNSUPPORTED_MEDIA_TYPE`；406（无体）；缺参与 NUL 400 `INVALID_REQUEST`（原为 500）。
- 剩余事项：请求体无上限（边缘 nginx 默认 1 MiB 截断）、登录计时差可枚举账户、无每用户任务配额，见 `docs/security-api.md` 第 6 节。与 D19-B 的真实组合联调由最后启用 PR 承担。
- 审查者：成员 B；作者不能自批。
- 合并条件：最新 main 组合通过全部必需检查，ci-gate=success、真实报告存在、无未解决阻塞讨论、同伴批准。
