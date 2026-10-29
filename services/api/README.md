# CodeLess HTTP API v0

HTTP 路由、资源和认证契约见仓库的 `contracts/openapi.v0.json` 与 `contracts/README.md`。

## 请求体字节上限

`/api/v0/` 请求体最多 **128 KiB（131072 字节，包含 JSON 语法、转义和空白）**。
这是传输字节上限，不是字符数；已有字段长度与 Unicode 码点校验仍然适用。
恰好 131072 字节允许继续处理，131073 字节及以上拒绝；8000 码点提示词即使全部使用
UTF-16 代理对 JSON 转义（96000 字节），仍可连同现有元数据放入此上限。

身份、CSRF、管理员角色及规范路径检查先执行，保留现有 401/403/400 优先级。
通过这些检查后，服务端在 MVC/JSON 解析和控制器副作用之前检查整个请求体。
超过上限返回 **HTTP 400**、`code: INVALID_REQUEST`、`Cache-Control: no-store`，
错误消息为 `Request body exceeds 131072 bytes`，不回显输入内容。例如：

```json
{
  "code": "INVALID_REQUEST",
  "message": "Request body exceeds 131072 bytes",
  "timestamp": "2026-10-29T03:00:00Z",
  "path": "/api/v0/applications",
  "traceId": "example-only",
  "details": {}
}
```

该规则同时适用于 `Content-Length` 和 chunked/未知长度的请求；不能用合法 JSON 前缀加超大尾部空白绕过。
声明长度已超限时不读取请求体；其他请求最多读取上限加 1 字节后决定拒绝。
客户端应缩小请求内容；同一超大请求的重试不会使它有效。

实现与回归：`src/main/java/dev/codeless/api/auth/ApiRequestBody.java`、
`src/test/java/dev/codeless/api/auth/RequestBodyBoundaryHttpTest.java`、
仓库 `tests/regression/api/README.md`。没有新增 HTTP 状态码、资源字段或客户端权限。
