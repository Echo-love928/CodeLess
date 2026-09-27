# Contracts v0

`openapi.v0.json` 定义 HTTP 接口；`schemas/v0/*.schema.json` 定义持久化/事件资源；`examples/v0/valid` 与 `examples/v0/invalid` 是对应的正反 fixture。

约定：

- ID 是 UUID；时间是带时区的 RFC 3339 `date-time`。
- 写接口要求 Bearer 鉴权；发布请求只接受已验证的不可变 `versionId`，服务端仍必须做授权和状态检查。
- 任务终态为 `READY` 或 `FAILED`，模型不得直接设置终态。
- build 的 `exitCode` 是真实工具退出码；`null` 表示尚未获得结果，不能解释为成功。
- v0 破坏性变化必须新开版本。

运行 `pnpm verify:contracts` 会验证所有正例通过、所有反例失败，并检查 OpenAPI 引用和关键生命周期不变量。
