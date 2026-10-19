# D15 `.cn` / `.top` 兼容交接

2026-10-17，Asia/Shanghai。按用户要求实现新域名兼容并验证现有功能。

## 候选与范围

- 当前分支 `codex/d15-integration-publication`，基线 `fcc8e2f26ff4e2bc14bf86932d9da3fc39172583`。
- 本交付为工作区改动，尚未提交/推送；不能用基线历史 CI 6/6 代替本次候选检查。
- main 仍为 `572304e0cc21fbfe2e22cf7c286b4c3f29ad1013`，未修改或合并。
- 公网支持 `com/net/org/dev/app/cn/top`；`.test` 仅为本地测试后缀。
- 新增 `.cn/.top` 仅接受直接注册的两段主域名；配置使用 `app.example.cn` 等至少三段的 Host。
  平台、预览、发布仍须三个不同的主域名。`.com.cn`、省级多级后缀和已知共享服务根不在本次支持范围。

生产变更限于：Java 预览与发布域名校验、Node 预览/发布校验、前端发布 URL 校验，
以及唯一策略数据 `services/api/src/main/resources/network/site-policy.json`。
Java classpath、Node 模块和前端生产 bundle 使用同一数据；新增主机名合法性与受限站点 helper。
无依赖/根锁/CI/迁移/公共 HTTP 请求响应字段变更，无发布状态、鉴权、CSRF、版本冻结、
构建限制、TLS 校验或探测器 IP 策略变更。

跨模块改动是必要的：四处白名单不同时更新会导致前端/API/runner 相互拒绝。
策略数据来源、公共后缀限制、完整仓库部署要求见 `docs/deployment/D15-domain-suffix-compatibility.md`。

## 验证

所有原始输出和退出码在被 Git 忽略的 `.local-data/d15-domain-policy-2026-10-17/`。
工具锁定 Node 24.16.0、pnpm 12.6.0、Java 21、Maven 3.9.11。
本机 Corepack 使用已存在的 `C:/Users/12058/AppData/Local/node/corepack` 缓存；未更改依赖版本。

| 命令/检查 | 实际结果 |
| --- | --- |
| `pnpm verify:static` | native 0；前端 106/106、契约测试 14/14、lint、类型和生产构建通过。保留原有 OpenAPI oneOf 重叠警告。 |
| `node --test tests/infra/site-policy.test.mjs` | native 0，3/3；包含 36 组跨端共享边界向量、原后缀、同站点拒绝和 Nginx 渲染。 |
| Maven 定向 `SitePolicyTest,PublicationGatewayConfigurationTest,PreviewHttpTest,PreviewCnHttpTest,PreviewTopHttpTest` | native 0，8/8；真实 HTTP/SQL 与原有鉴权、CSRF、签名、越权、草稿及失败版本断言。 |
| 首轮 `pnpm verify:api` | native 1；227 项中 1 failure、17 errors、0 skipped，原始失败保留。 |
| API 失败范围组合诊断 | native 1；25 项中 20 通过、5 个版本用例失败；详情如下，不能写成诊断整体通过。 |
| Maven `TaskSseHttpTest,VersionHttpIntegrationTest` | 隔离修正后 native 0，15/15，0 failure/error/skip。 |
| `pnpm verify:runner` | native 0，85/85，0 failure/skip。 |
| `pnpm verify:e2e` | native 0，56/56，原并发与超时；包含新增两项 `.cn/.top` 发布面板场景。 |
| 本地 `.cn` 实际托管 | native 0，1/1；真实构建、Chromium、Nginx HTTPS、路径保护、资源 404、摘要绑定、失败不覆盖旧发布。 |
| 本地 `.top` 实际托管 | 首轮失败且因遗留 live handle 被中断；独立目录 TAP 诊断 native 0，1/1。未确认首轮根因。 |
| 最终 fixture 代码的原 `.test` 托管 | `hosting-test-final.log` native 1，第二次发布目录 rename 抛出 EPERM；保留失败。独立目录 `hosting-test-diagnostic.log` native 0，1/1。不是首次失败已修复的证明。 |
| 最终完整 API 门禁 | `api-full-final.log`，native 0；227/227、0 failure/error/skip，JAR 打包成功。2026-10-17 22:05:38 +08:00 完成。 |
| 远端 CI / 独立复审 / 合并 | 未执行；未自批、未合并。 |

`hosting-cn/acceptance.json`、`hosting-top-diagnostic/acceptance.json` 均明确
`localTlsFixture=true`、`publicMilestoneReached=false`。生产探测入口拒绝私网目标的原断言保留。
测试证书和私钥仅在忽略的本地 fixture 目录，不是部署证书，不应公开归档。
E2E 重写的 8 张历史截图已先归档到本轮忽略目录，再按原始哈希恢复；历史截图未被新结果覆盖。

## 首轮失败与最小修正

1. 新增 HTTP 配置测试未及时关闭 Spring 上下文，增加连接池占用；首轮末尾出现 PostgreSQL
   `too many clients already`，导致 SSE 10 项和版本 HTTP 5 项上下文加载失败。
   两个新增类均补上 `DirtiesContext(AFTER_CLASS)`；生产连接上限、断言和并发未改变。
2. D14 恢复测试将固定截图名复制到已有证据目录，抛出 `FileAlreadyExistsException`。
   默认输出改为每轮 UUID 子目录；显式指定证据路径的语义不变，原始截图不覆盖。
3. 首轮 D14 还有一次快照目录 `Files.move` 的 Windows `AccessDeniedException`。
   目录未见只读属性；独立证据目录复查该类 7/7 通过。根因仍为 UNKNOWN，不声称已修复。
4. 首轮真实平台预览出现一次 502，组合诊断该用例通过；没有独立确认其根因，保留原始诊断。
5. 组合诊断中 D11 首个用例从共享真实队列领到了其他场景的任务，后续四项因前置失败未执行。
   参照已有 AgentLoop fixture，仅把 D11 自身任务的创建时间设为固定较早值，保留精确 claimed-ID 断言，
   不消费或删除其他测试任务。SSE 与版本组合复查 15/15 通过。
6. `.top` 首轮在 live-handle 发布阶段失败，测试没有在此失败路径关闭本地 HTTP 服务，阻止报告正常结束。
   仅将 fixture handle 关闭移入 finally；保留原始日志。之后独立目录诊断通过，不能反推首次失败原因已确定。
7. 最终 fixture 代码的补充 `.test` 托管检查在第二次冻结发布写入抛出 Windows `EPERM`，
   位置为未改动的 `services/runner/src/publish/store.mjs:43` 的目录 rename。
   独立文件系统诊断调用同一 store：未挂载和 Docker bind mount 各 30/30 通过，未稳定复现；
   随后独立目录运行完整 `.test` 托管 1/1 通过。根因为 UNKNOWN，未修改生产 writer、添加重试或削弱断言。
   首次自编诊断漏传 buffers 参数，结果无效；修正后的诊断输出另存 `rename-diagnostic-corrected.log`，未覆盖首次输出。

## 未完成与限制

最终完整 API、static、runner、E2E 四个检查均已独立执行并通过；未另行执行 `ci:gate` 汇总器或远端 CI。
首轮出现的 Windows 文件访问异常、预览 502、`.top` live-handle 发布异常及补充 `.test` EPERM 在各自后续检查未重现，
仍保留首次失败的 UNKNOWN 根因；后续通过不能作为首次根因已修复的证明。
正常及负向用例的通过是当前候选的实测证据，不是对所有未来部署环境的无条件保证。

D15 真实公网验收仍为 BLOCKED：实际域名、DNS/TLS 尚未就绪，统一 SNI 入口、受信 worker 与
API 的 Docker 控制权限分离及真实鉴权发布验收仍待完成。本轮没有修改服务器或把本地 fixture 当作公网成功。
真实模型质量评测不在本轮验证结论内。开发 token 无独立实测计量，UNKNOWN。
