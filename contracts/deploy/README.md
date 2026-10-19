# D15-A：版本锁定发布契约

基线 `572304e`，前置 D11-A 的不可变 snapshot、D14-A 的 VERIFIED 晋级/失败保留。
HTTP 使用既有 session + CSRF；只有 owner 显式点击 POST 可以创建发布。模型工具注册表没有发布工具。
本契约与 D15-B 独立对接，最后启用 PR 负责共享 OpenAPI 登记、真实托管、面板及公网验收。

## HTTP

- `POST /api/v0/publications`：严格 `{applicationId, versionId, artifactDigest}`，
  `artifactDigest` 为 `sha256:<64 lowercase hex>`；必需 `Idempotency-Key: [A-Za-z0-9_-]{16,128}`，建议 `crypto.randomUUID()`。
  返回 **202** 既有 v0 Publication（包括 nullable url/publishedAt），表示逻辑请求已记录，不表示公开发布成功。
  用户重复同一次点击须复用 key；重新尝试失败部署须显式点击并生成新 key。不同 key 是不同逻辑发布。
- `GET /api/v0/publications/{publicationId}`：200 既有 Publication。
- `GET /api/v0/publications/{publicationId}/deployment`：200 `deployment.schema.json`，
  `publication`、固定 source/artifact/report 摘要、`history`、`phase`、nullable failureCode、`latestSuccessful`。
- `GET /api/v0/applications/{applicationId}/publications`：200 `list.schema.json`，最近100条请求及独立 `latestSuccessful`。
  后者来自所有 PUBLISHED 记录，不受100条限制；失败 UI 应始终展示它，不能用最近 attempt.url 替代。
- 成功/业务拒绝都 no-store、nosniff；匿名401、CSRF403、跨owner/跨app/不存在404（ADMIN无绕过）。
  body、UUID、key 格式400。DRAFT/FAILED、归档app、摘要不符或幂等冲突409；缺失快照409；篡改/不可读卷503。

共享 OpenAPI 原请求只有两个ID，本卡增加必需哈希/key，以及两个读路由。
`openapi.patch.json` 是A独立交付的差异；D15集成分支现已登记到共享 `contracts/openapi.v0.json`，
并由静态门禁核对全部路由及严格请求。不得在前端仍发送旧body时启用。
现有 Publication 响应字段和三个 status 含义保持。服务端不接受 URL、路径、命令、托管凭据或模型的自动发布参数。

## 锁定与状态

owner+key SHA-256 派生publication UUID（无原始key落盘）；PG advisory transaction lock处理跨app同key，
应用行锁与编辑/恢复/READY提交协同。同key+相同app/version/artifact返回原ID，包括终态；不同绑定409。
只接受 VERIFIED、build SUCCEEDED/exit0/completed，以及匹配 buildId/source/artifact 的 PASSED 冻结报告。
记录绑定 buildId、sourceDigest、artifactDigest、reportDigest。工作器再次核验数据库和不可变卷，
只将确切artifact manifest成员的校验字节传给受信托管适配器，不交付工作目录/源码/平台密钥。

`PREPARING → PUBLISHING → PROBING → SUCCEEDED | FAILED`，任何非终态可失败。
SQL状态依次为 REQUESTED / PUBLISHED / FAILED，只有同version/hash的实际成功probe才提交 PUBLISHED/https URL。
未知、null、错误version/hash、超时都失败；不会将未知探测当成功。每次请求使用独立发布位置，
适配器绝不能覆盖旧publication地址；因此探测失败不会破坏上次已成功的服务。

阶段账本：`codeless.deploy.root`，默认 `${codeless.agent.private-root}/deployments`，仅私有持久卷。
UUID目录、只增binding/编号event文件、force + atomic move；拒绝symlink/junction/hardlink/祖先别名。
无需新迁移、依赖或根锁变动。生产默认每秒扫描最多10个REQUESTED，PG publication行锁+SKIP LOCKED
使多个实例只能执行一次；所有实例**必须共享同一个私有卷**。测试profile禁止后台发布worker。
发布验收使用独立的真实PostgreSQL，测试类结束关闭Spring上下文；不与既有回归共享全局任务队列或连接池。

卷与PG没有跨资源事务。binding先落盘；SQL回滚后的完全相同、仅PREPARING孤儿允许复用，其他孤儿失败关闭。
终态event在SQL commit后追加。进程崩溃于PUBLISHING/PROBING后，恢复标记FAILED/DEPLOYMENT_INTERRUPTED，
**不重复调用hosting**；已上传但未提交地址可能成为孤儿，不能当成功。终态event缺失/卷异常与SQL冲突时
deployment phase为UNKNOWN或读接口503，SQL原记录/历史成功不被改写。由运维核对孤儿/不完整账本，禁止自动重放。

## D15-B 接入

注入 `DeploymentGateway` bean；默认适配器只抛 `HOSTING_UNAVAILABLE`，不会访问网络或产生公开成功。
`publish(Payload, deadline)` 返回独立、不可变的https公开地址；Payload仅publicationId/versionId/artifactDigest/
manifest资产字节。`probe(Payload,url,deadline)` 必须实际访问已配置的托管origin、校验已服务字节，
返回 accessible/versionId/artifactDigest；三个都一致才成功。两个调用共30秒截止，适配器须自行设置有限连接/读取时间。
API拒绝明显私网字面URL；**DNS pinning、重定向拒绝、网络隔离和实际内容检查由B适配器实现**，不能仅回显Payload。
不提供任意URL参数、开放shell或通用网络代理。异常信息不进入公开报告，只有固定错误码。

B托管还须：刷新子路由正常、缺失JS404、源码/map/目录索引不泄露、公开内容版本正确，失败面板保留旧成功。
A测试的 `hosting.example.test` 是明确fixture，**不是公网验收**；版本生成/DB/build/Chromium是真实执行。
