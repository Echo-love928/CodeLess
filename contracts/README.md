# Contracts v0

`openapi.v0.json` 定义 HTTP 接口；`schemas/v0/*.schema.json` 定义持久化/事件资源；`examples/v0/valid` 与 `examples/v0/invalid` 是对应的正反 fixture。

约定：

- ID 是 UUID；时间是带时区的 RFC 3339 `date-time`。
- 平台认证使用同源、主机级 HttpOnly `JSESSIONID` 会话 Cookie。先调用 `GET /api/v0/auth/csrf` 取得 CSRF token，登录以及所有 `/api/v0/` 写请求携带 `X-CSRF-Token`；刷新通过 `GET /api/v0/auth/me` 恢复登录态。浏览器自动管理 Cookie，前端 JavaScript 不读取或另行持久化它。仅本机纯 HTTP 联调可在 API 进程设置 `CODELESS_COOKIE_SECURE=false`。
- 发布请求只接受已验证的不可变 `versionId`，服务端仍必须校验登录身份、所有权和状态。
- 任务终态为 `READY` 或 `FAILED`，模型不得直接设置终态。
- build 的 `exitCode` 是真实工具退出码；`null` 表示尚未获得结果，不能解释为成功。
- v0 破坏性变化必须新开版本。

运行 `pnpm verify:contracts` 会验证所有正例通过、所有反例失败，并检查 OpenAPI 引用和关键生命周期不变量。
