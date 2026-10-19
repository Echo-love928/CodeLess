# D15 `.cn` / `.top` 域名兼容

日期：2026-10-17（Asia/Shanghai）。在 `codex/d15-integration-publication` 上扩展部署配置兼容性。

## 配置范围

公网后缀：`com/net/org/dev/app/cn/top`；`test` 保留为本地测试后缀。
仍要求 HTTPS、三个不同的独立主域名、配置 origin 至少三段、无用户信息/查询/片段/业务路径。
例如 `app.example-platform.cn`、`preview.example-preview.cn`、`sites.example-public.top`。
根域名本身如 `example.cn` 不作为配置 origin；为它添加 app/preview/sites 子域名。
多个子域名属于同一个主域名时，即使端口或协议有所区别，也不能满足三个独立站点要求。

本次新增支持只针对直接注册的两段主域名，例如 `example.cn`、`example.top`。
`.com.cn`、`.net.cn`、`.org.cn`、省级 `.bj.cn` 等多级公共后缀仍不支持；已知共享服务根域名也拒绝。
没有通过删除域名白名单、允许共享主域名、修改 Cookie 或放宽 TLS/公网 IP 检查来获得兼容。

## 实现

唯一策略数据源为 `services/api/src/main/resources/network/site-policy.json`：

- Java 的 `network/SitePolicy.java` 从 classpath 读取，供预览凭据接口和发布网关共用。
- Node 的 `preview/site-policy.mjs` 直接导入同一份 JSON，预览、发布、部署渲染和资源预检随之生效。
- 前端 `deploy/site-policy.ts` 在生产构建时导入同一 JSON，发布面板继续核对发布记录绑定的精确 URL。
- 无新依赖、锁文件变更、数据库迁移或公共 HTTP 请求/响应字段变更。

部署必须保留固定候选仓库的完整目录结构，包括上述策略 JSON，不能只复制 runner 的单个入口文件。
Java JAR 自动打包该资源，前端生产构建内联同一数据；三者应从同一候选构建，不能混用旧前端与新 API。

安全边界跨预览、发布、API 和前端，必须同步修改；只修改 B 发布目录会留下互不兼容的校验。
对原预览 HTTP 测试仅把固定期望 Host 改为读取该测试配置值，原有会话、CSRF、越权、草稿、失败版本、
签名和不可变版本断言保留，并以子类在 `.cn` 和 `.top` 两种配置中重复执行。

## 回归中修正的测试设施

- 新增两组 HTTP 配置测试使用 `DirtiesContext(AFTER_CLASS)`，及时关闭各自的 Spring 上下文和连接池，
  避免完整套件累积连接；未增加生产或测试数据库连接上限。
- `EditVerificationIntegrationTest` 默认把证据写到每轮独立 UUID 子目录；显式证据路径参数仍保持原语义。
  原始截图不会被覆盖，真实预览和恢复断言均保留。
- `VersionHttpIntegrationTest` 只将自身待执行任务的 fixture 创建时间提前，与已有 AgentLoop 测试一致，
  避免共享 PostgreSQL 队列中的其他场景遗留任务被误领；精确任务 ID、真实构建及版本断言保留。
- 本地托管测试将 live artifact handle 的关闭放入 `finally`，避免发布准入失败时遗留本地 HTTP 服务，
  阻止 runner 退出和报告原始错误。生产托管实现未因此改变。

以上均针对实际失败作出最小修正，没有删除失败断言、跳过测试、放宽超时、降低并发或关闭隔离。

## 公共后缀数据与维护

拒绝集合来自 Public Suffix List 官方 `2026-10-16_23-32-13_UTC` 快照，
commit `2dbfce14c57bcea83fef2be3bdcb560667d7ef93`，原文件 SHA-256：
`d805bffa0e2e203a8e27ca75c596e5b24ac096d11632904492115248e9ab9bd9`。
来源和 MPL 2.0 许可地址记录在策略 JSON 中。

提取方法：读取所有非注释且以 `.cn` 或 `.top` 结尾的多级 ICANN/PRIVATE 规则，
去除前导 wildcard/exception 标记，转为 ASCII，取最后两段、去重排序。
得到 52 个拒绝根；这些根下整个子树都拒绝，包括通配规则对应的共享服务根。
这是一份保守的两段站点策略，不是完整 PSL 算法；未来新增注册局或共享服务规则需要审核更新快照，
同步重跑三端共享边界用例。运行时不联网下载或自动改变安全策略。
若将来要支持多级可注册主域名，应单独设计公共后缀解析，不直接移除拒绝集合。

## 验证与公网边界

共享边界向量位于 `services/api/src/test/resources/network/site-cases.json`，由 Java、Node、前端三端执行。
覆盖原六后缀、新两后缀、非法 Host、多级 `.cn`、已知共享 `.cn/.top`、大小写和嵌套版本域名。
另外验证三个相同后缀/混合后缀的独立站点、同站点拒绝、Nginx 渲染、精确发布 URL 绑定及真实 HTTP/SQL。
最终命令、结果和限制记录在本任务交接中；不能以源代码修改或单元通过推断公网可达。

真实公网仍需要实际域名、IPv4 DNS、覆盖基准名与通配项的有效 TLS、统一入口、受信 worker 权限分离，
以及实际鉴权发布和外部访问验收。此次兼容不自动启用公网发布，也不关闭 D15 公网阻塞。
