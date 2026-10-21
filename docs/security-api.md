# D19-A API 权限与输入边界

本文件是 API 安全测试矩阵和已修复缺陷记录。所有结论都来自真实 HTTP（内嵌 Tomcat）+ 真实 PostgreSQL 的
`ApiSecurityMatrixTest`，攻击请求逐字节发送，不经 HTTP 客户端库规范化。模型固定为 `deterministic-mock`，与本专项无关。
版本快照通过真实 `LocalVolumeSnapshotStore` 冻结、使用 fixture runner 报告：只证明授权、存储与输入边界，不证明真实构建或浏览器验证。

## 1. 信任边界

- 身份只来自会话 Cookie（`JSESSIONID`，HttpOnly、Secure、SameSite=Lax、host-only）；会话 ID **只**从 Cookie 读取（`server.servlet.session.tracking-modes: cookie`）。
- 每个不安全请求（非 GET/HEAD/OPTIONS）必须带与会话绑定的 `X-CSRF-Token`；令牌只从请求头读取，查询串和请求体里的同名字段无效。
- 所有权在服务端按数据库判断：应用 `owner_id`，任务/版本/发布经应用 join。外部用户和不存在的 ID 返回同一个 `404 NOT_FOUND`。
- 客户端提供的路径、文件、模板、URL、托管位置一律不被采用：请求体只接受白名单字段；源码只按冻结清单的精确成员读取；组件修改的源文件由服务端映射决定。
- 生产边缘 nginx 以规范化 URI 匹配 `location ^~ /api/v0/`，但 `proxy_pass` 不带 URI 时按**原始**请求目标转发。所以 API 自身必须对每种写法得出与 Spring 路由相同的判断。

## 2. 测试矩阵

`services/api/src/test/java/dev/codeless/api/security/ApiSecurityMatrixTest.java`，在 `pnpm verify:api`（因而在 `ci-gate`）中运行。

| 用例 | 覆盖 | 判定 |
| --- | --- | --- |
| 路由清单门禁 `everyRegisteredRouteIsClassifiedInTheSecurityMatrix` | Spring MVC 注册的全部 44 个处理器键（方法 + 模式 + produces）。分类：PUBLIC 3、SELF 4、ADMIN 9、INTERNAL 1、FRAMEWORK（`/error`）2、OWNER 25。 | 注册集合与矩阵完全相等。新增路由未分类即失败，被分类后自动进入下面的 T1/T2 攻击。 |
| D19-A-01 / T1 横向越权 | 25 个 OWNER 路由：应用（详情、改名）、任务（详情、事件 JSON、**SSE**、诊断、取消、创建）、修改（会话/组件修改、修改详情）、版本（详情、列表、恢复）、**源码**（文件列表、内容、快照、组件映射/选择、**导出**）、**预览凭据**、**发布**（创建、详情、部署记录、列表）。另 6 个“自己的容器 + 他人子资源”交叉引用。 | 攻击者对受害者真实资源的请求必须是 `404 NOT_FOUND`，且状态、code、message 与随机 ID 完全相同；响应不含受害者私有值；数据库与存储根逐项不变。6 个交叉引用的响应与把他人子资源换成随机 ID 时完全相同（404，或 409 `EDIT_BASE_UNAVAILABLE`，或 200 `selectable:false`），从不被接受。随后受害者发同样请求作为正向对照（全部得到预期 2xx）。ADMIN 路由对普通用户 403；内部目录无密钥或伪造密钥 403，只有回环 + 正确密钥 200。 |
| D19-A-02 / T2 CSRF | 13 个不安全路由 × 5 种坏令牌（缺失、他人会话的有效令牌、大写、空、截断）+ 令牌只放在查询串；13 种路径写法（`/api;x=1/v0/`、`/%61pi/v0/`、`/api/%76%30/`、`/api/v0;x=1/`、`//api/`、`/api//v0/`、`/./api/`、`/x/../api/`、`/API/`、首字母百分号编码、`;x=1`、`;jsessionid=0`、尾斜杠），已登录 GET 路由同样 13 种写法；URL 中的会话 ID；不可解码目标；CORS（外部 Origin 读令牌、预检）；HEAD/GET 调用取消、`X-HTTP-Method-Override`。共 78 个令牌请求、498 个写法请求。 | 坏令牌一律 `403 CSRF_INVALID`；任何写法都不得 2xx/3xx/5xx（只允许 400/401/403/404/405）；登出写法后受害者会话仍有效；状态不变；无 CORS 授权。 |
| D19-A-02 登录限流 | 5 次失败（大小写、首尾空白、Tab 写法共用计数）后正确密码 429；已知账户与未知邮箱各 24 个并发错误猜测；会话 ID 轮换与其他账户不受影响。 | 每个窗口最多 5 次真正比对密码，其余 429；锁定后正确密码仍 429。 |
| D19-A-02 字段长度 | 应用名 120 码点（4 字节 emoji）/121、空白名、描述 1000/1001、NUL、改名 121；任务/会话修改/组件修改提示词 8000/8001、NUL；messageId 129；管理员取消理由 201；嵌套 2000 层 JSON；登录邮箱 321/密码 1025；`text/plain` 与 `Accept: image/png`；3 MiB 登录体。 | 上限内成功，越界 400；媒体类型 415/406；没有 500。 |
| D19-A-02 幂等键 | 同键同体重放、同键异体 409、跨端点（生成 → 修改）409、攻击者用同键访问他人应用（与随机应用同为 404）、攻击者在自己应用用同键（独立任务）、8 个并发同键（1 行）、5 种非法键；发布键重放、跨应用复用 409、攻击者用受害者的发布键（按调用者隔离，独立发布）、4 种非法发布键。 | 幂等键按调用者/应用隔离，不泄露、不重复创建。 |
| D19-A-03 / T3 日志 | 从测试类加载起的全部 stdout/stderr（含 Spring 启动、Tomcat、所有请求）、部署账本、模型/文件审计、管理审计目录、任务事件；本类用到的 240 个秘密值（密码、错误猜测、会话 ID、CSRF 令牌、签名/目录密钥、签发的预览凭据、数据库口令、请求头中的 Bearer/API key、查询串令牌）+ 8 个模式。先写入一条 SLF4J 与一条 stderr 金丝雀，证明捕获有效。 | 任何来源都不出现任何秘密值或模式；金丝雀必须被看到，空扫描不能通过。 |
| D19-A-03 不信任客户端路径 | 17 种源码读取路径（`../`、绝对路径、`C:\`、UNC、反斜杠、ADS `::$DATA`、设备名、大小写别名、尾随空格、NUL、双重编码等），缺少 `path`；客户端提供 `files`/`workspace`/`path`/`url`/`sourceFile`、React 模板、模板路径、SERVER 数据模式。预览凭据请求带伪造 `Host`/`X-Forwarded-Host` 不影响签发地址（地址只来自配置）。 | 只有精确清单成员可读，其余 400/404 且无内容；越界字段 400。 |
| T4 非法输入 | 12 种非法发布（草稿、他人版本、未知/源码摘要、大写摘要、客户端 URL/文件/托管路径、非规范 ID、路径型 ID、数组体、null 体）、13 种非法生成/修改/恢复/预览、上面 17 种源码路径。 | 全部 4xx；数据库（应用、任务、事件、版本、发布）与全部存储根（版本、部署账本、工作区、审计）文件树逐字节不变；没有可执行文件。 |

## 3. 已修复缺陷

修复前在同一测试上的红色运行保存在 `.local-data/d19-a/red-1/`；可复现的反证见第 4 节。

| # | 等级 | 缺陷与复现（修复前） | 修复 |
| --- | --- | --- | --- |
| 1 | 高 | `AuthFilter` 用原始 URI 判断 `startsWith("/api/v0/")`，而 Spring 按解码、去掉 `;参数` 的路径路由。`POST /api;x=1/v0/auth/logout`（以及 `/%61pi/v0/…`、`/api/%76%30/…`、`/api/v0;x=1/…`）带受害者 Cookie、**不带令牌** → `204`，受害者被登出；`POST /api;x=1/v0/auth/login` 不带令牌 → `200`，匿名会话被登录进攻击者账户（登录 CSRF）；`GET /api;x=1/v0/auth/me` → `500`（处理器在无身份上下文中执行）。生产 nginx 会把 `/%61pi/v0/…` 匹配到 `/api/v0/` 并原样转发。SameSite=Lax 使跨站 POST 不带 Cookie，所以跨站利用需要同站位置；但契约“每个不安全请求都要令牌”对这些写法失效，任何不经 `OwnershipGuard` 的后续处理器都会完全绕过认证。 | 过滤器用 Spring 实际路由的路径（解码、去 `;参数`、合并 `//`、消解 `.`/`..`）做全部判断；非规范目标在身份、CSRF、角色检查**之后**一律 `400 INVALID_REQUEST`，所以 401/403 的契约码对每种写法保持不变（D17-A 的 `/api/v0/%61dmin/session` 仍是 403）。不可解码目标 400。会话 ID 只接受 Cookie。 |
| 2 | 高 | 登录限流先检查、再做 BCrypt、最后才计数：24 个并发错误猜测中 17 个被真正比对（反证运行 19 个），限值是 5。 | 在比对密码前原子地预占一次尝试（`LoginAttempts.acquireKnown` / `acquire`），成功登录清零。顺序使用的语义不变（第 6 次 429）。 |
| 3 | 低 | 非法输入得到 500：文本中的 NUL（PostgreSQL 22021，名称/提示词/登录邮箱）、缺少必填查询参数、不支持的 `Content-Type`、不可接受的 `Accept`。 | `GlobalExceptionHandler`：22021 与缺参 → `400 INVALID_REQUEST`；`415 UNSUPPORTED_MEDIA_TYPE`；`406`（无体）。其他数据库错误仍是 500。 |

## 4. 回归 fixture 与反证

`node tests/security/api/record-command.mjs MODE`（固定 deterministic-mock，移除模型 key/name；原始日志、JUnit、证据在 `.local-data/d19-a/runs/`）。
每个 `mutation-*` 重新引入一个缺陷，只有当构建失败且恰好由预期用例失败、文件按字节恢复时才记为 PASSED。

| 模式 | 重新引入 | 必须失败的用例 |
| --- | --- | --- |
| `mutation-filter` | `AuthFilter.java` 回到基线 `3ec4b99` | T2（63 条违规：登出/登录无令牌成功等） |
| `mutation-login` | `AuthController.java`、`LoginAttempts.java` 回到基线 | 登录限流（19/24 被比对） |
| `mutation-errors` | `GlobalExceptionHandler.java` 回到基线 | 字段长度、T4 |
| `mutation-ownership` | 版本所有权条件改为恒真 | T1（5 个源码/映射路由泄露） |
| `mutation-logging` | 登录处理器把邮箱与密码写入 INFO 日志 | T3 |
| `mutation-inventory` | 新增一个未分类的 GET 路由 | 路由清单门禁 |

## 5. 门禁

本专项是 `services/api` 的普通 JUnit 测试，没有改根脚本、CI 或锁文件：`pnpm verify:api` → `ci-gate` → 远端必需检查 `api` 与 `ci-gate`。
任何安全失败即门禁失败，阻止候选版本。测试使用自己的上下文（独立存储根、连接池 5、`@DirtiesContext` 类结束关闭），不增加共享 PostgreSQL 的连接占用。

## 6. 残余风险（未在本卡修复）

- **请求体无上限**：Jackson 3.1.5 默认单个字符串上限 1 亿字符、文档长度不限；3 MiB 登录体被完整解析后才 400。已发布的两种 nginx 配置都没有设置 `client_max_body_size`，默认 1 MiB 在边缘截断；直连 API 端口没有保护。建议后续给 `/api/` 加请求体上限过滤器。
- **登录计时差**：未知邮箱不做 BCrypt，响应明显更快，可据此枚举账户。建议对未知账户比对一个固定的假哈希。
- 已知账户 5 次失败即锁 15 分钟，可被他人定向锁定（D03 既定取舍）；限流器在进程内，多实例需要共享存储（D03 已登记）。
- CSRF 令牌在登录时不轮换（会话 ID 会轮换）；属于纵深防御项。
- 新的幂等键可无限创建排队任务，没有每用户配额；属于额度控制，不在本卡范围。

## 7. 契约差异（交公共契约维护者，本卡未改 `contracts/`）

- 非规范的 `/api/**`、`/internal/**` 请求目标：`400 INVALID_REQUEST`（在 401/403 判断之后）。
- 不支持的 `Content-Type`：`415 UNSUPPORTED_MEDIA_TYPE`；不可接受的 `Accept`：`406`（无体）；缺少必填参数、文本含 NUL：`400 INVALID_REQUEST`。此前均为 `500 INTERNAL_ERROR`。
- 会话 ID 只通过 Cookie 传递；`;jsessionid=` 不被接受。
- 登录限流语义不变；并发时也不会超过 5 次密码比对。
