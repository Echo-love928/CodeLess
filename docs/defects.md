# 后端缺陷清单

## D24-A-API-01｜P1｜API 在字段校验前无请求体字节上限

- 来源：`docs/security-api.md` §6 已登记的请求体无限制风险。D21-A 的模型网络/效果失败仍保留原结论；本项不冒充其修复。D23-A 的恢复包与配置不变。
- 影响：直连 API 的已授权请求会把任意大的 JSON 字符串或尾部空白交给 MVC/Jackson。字段校验发生在解析后，不能保护解析内存；合法 JSON 前缀还可能先产生业务副作用。
- 稳定复现：同一 `RequestBodyBoundaryHttpTest` 配合主线 `5a0f14d` 的 `AuthFilter`，发送正常创建应用 JSON 加超过 128 KiB 的空白，真实 Tomcat/PostgreSQL 返回 **201**（期望 400）。`baseline-http` exit 1，1 failure、0 error；不是连接失败。原过滤器测试 4 项中两项失败，handler 被调用。
- 最小修复：`services/api/.../auth/ApiRequestBody.java` 在 `/api/v0/` 请求完成身份、CSRF、角色及规范路径检查后、MVC 前，检查声明长度并最多读取 131073 字节；超限统一 `400 INVALID_REQUEST`、`Cache-Control: no-store`，不回显请求内容。允许最多 131072 字节；chunked/未知长度亦受限，合法前缀不能提前执行控制器。
- 兼容：128 KiB 可容纳 8000 个 Unicode 码点的最坏 JSON 转义（96000 字节）及现有请求元数据；真实 PostgreSQL 断言持久化的 8000 个 emoji 与输入相同。恰好上限仍可创建应用，取消任务仍为 FAILED/CANCELLED。
- 安全保持：匿名/CSRF/角色/非规范路径按原顺序拒绝；不改路由、版本、发布、runner、模型权限、数据库、公共契约、锁或 CI。没有新状态或错误码；该字节上限是现有 400 输入拒绝边界的收紧，公共文档维护者可补充说明，无需 B 修改 API 客户端。
- 状态：修复与专项先红后绿成立；阶段门禁、精确候选及剩余限制见 `docs/handoffs/D24-A.md` 最新节。未获全部必需检查和另一人批准前不合并/发布。

复现与证据入口：`tests/regression/api/README.md`。原始日志私下保存，公开 command.json 绑定源码 SHA256、原生命令/退出码和日志 SHA256；失败记录不改写。

未扩大范围：登录计时差、多实例限流、每用户配额等既有条目留原维护者。此次限长不提供慢请求时间/并发配额；沿用服务器/边缘超时。D21 真实模型效果与 D23 Linux/异机运营启用仍需原负责人验收。

## D24-A-ENV-02｜待B复审｜首轮本机预览入口到 API 的连接失败

- 首轮完整 `verify:api`：385 项，384 pass / 1 failure / 0 error / 0 skipped，native1。唯一失败 `PreviewPlatformIntegrationTest.realAuthenticatedPlatformGeneratesAndPreviewsWithoutApiOrSigningFixtures`，Java :84 → `tests/runner/mapping/platform-checks.mjs:36` 获取 CSRF 时收到 502/HTML。
- 原始入口诊断成功采集且未截断：csrf 的 CONNECT TIMEOUT 为 true，最终上游状态 `504, 502`，响应耗时 `60.049, 0.000`，连接和响应头时间仍为 `-, -`；其他连接错误细类 UNKNOWN 不改为已知原因。registryHealthy=true 不代表入口请求成功。
- 白名单摘要：`tests/regression/api/evidence/preview-502.json`，包含原始两份诊断的 SHA256；完整现场保留 `services/api/target/preview-platform-be59fb66-e007-4368-ab41-2967c61b8d6f/` 及本卡私有日志。未导出会话、头、查询串、请求体或内部上游地址。
- 入口的连接失败证据不能证明本卡输入限长导致异常，也不能证明宿主网络配置的具体根因；此前 D24-A 历史有同形状 502。固定代码4052647的远端六项 success单列，不能回填本地失败。
- 接手：B/runner与环境维护者核对 Docker→宿主 API 连接，A提供上述 API/入口关联诊断。先做受控连接失败复现及正负对照，再在真实入口复验；不延长超时、关闭隔离或重试至绿。该入口/宿主环境处理不夹入本卡安全修复。
- 首轮状态仍为FAILED，原始失败/未知诊断不改写。B审查后执行一次定向原入口诊断（native0、1/1）及一轮完整原始gate：`2026-10-29T06-29-39.894Z-gate`，static/api/runner/e2e/ci-gate均native0，API385/385、runner268/268、e2e75/75及全产品验收通过。被测HEAD9cf78ef，233份API源码/测试/资源与原失败运行一致，未修改入口配置、网络、超时、重试、断言或隔离。
- 当前本地完整门禁补验证据已齐，见 `tests/regression/api/evidence/review-round2-candidate.json`、`review-full-preview-diagnostic.json` 及 `review-response.md`。历史502未在本次复核重现，具体根因仍UNKNOWN；本轮没有可以声称的生产代码根因修复。由B及环境维护者复核是否解除此阻塞，本人不自行标CLOSED、不批准/合并/发布。最终HEAD远端必需检查与独立批准仍须满足。
