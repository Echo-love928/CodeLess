# D15 真实公网部署与发布验收

2026-10-18，Asia/Shanghai。统一 HTTPS 入口、worker 权限隔离、应用部署和真实发布验收均已完成。
`PUBLIC_ACCEPTANCE=PASSED`，汇总证明 `publicMilestoneReached=true`。本结论限于 D15 功能与隔离链路，不表示真实模型质量验收通过或当前 GitHub CI 已重新全绿。

## 可访问地址

| 用途 | 地址与结果 |
| --- | --- |
| 平台 | [app.codeless-platform.top](https://app.codeless-platform.top)，真实登录、创建应用、生成、预览与明确确认发布已验证 |
| 预览 | `v<32位版本UUID>.preview.codeless-preview.top`，受控凭据、真实 iframe、Partitioned/HttpOnly/Secure cookie；基准域和随机未授权版本不提供页面 |
| 成功发布 | [Ada Lovelace 示例页](https://d9f35ba94b79e8fb89361da2498b8dbf5.sites.codeless-publish.top/)，独立本机无登录浏览器访问与刷新通过 |
| 发布基准 | `sites.codeless-publish.top`，不是应用首页；未绑定发布 ID 的主机返回 404 |

服务器为 `23.136.172.128`，通过已有 `ssh huangjiaqi@23.136.172.128` 操作，继续验证既有 host key。
未购买额外资源。三个 `.top` 注册域分别承担平台、预览、发布，跨站隔离策略仍严格执行。

## 装配与权限

- 只有 edge 的标准 HTTPS 443 对外提供应用入口；按严格 SNI 将平台/预览与发布分流，未知 SNI 在 TLS 完成前关闭。没有绕过真实 DNS 或证书校验。
- API、preview、worker 使用独立非 root 服务账号。API/preview 不能访问 Docker socket、TLS 私钥；preview 也不能访问 worker IPC。生成的构建容器继续执行非 root、network none、只读根、cap drop、no-new-privileges、PID/CPU/内存限制。
- 只有受信 worker 能操作 Docker。API 使用 Unix socket 与固定 argv/根目录的桥接，worker 验证实际 Linux peer UID，不接受调用者指定命令或环境。Node 子进程不继承平台、模型、数据库凭据。
- worker job 独占标签用于 deadline/断线清理；实际中断构建后自有容器已移除。timer 实测回收过期自有容器，并保留无标签对照容器，随后只按该对照容器的精确 ID 清理。
- Nginx 容器 UID101、只读根、无 capabilities，TLS 仅以只读挂载供受控入口读取。数据库使用独立 internal 网络和命名数据卷，没有发布 5432。
- 专用防火墙链仅允许确定 ingress bridge 或 loopback 访问 8080/8788。独立本机检查 8080、8788、8789、5432、2375、2376 均不可公开连接，既有 SSH 规则保留。

源文件和操作说明在 [infra/public](../../infra/public/README.md)。受保护配置位于服务器 `/etc/codeless/`，随机登录密码、数据库密码和密钥没有写入仓库或复制到本机。

## 本次修复的实际部署问题

1. Java 临时冻结目录默认为 0700，分离账号后的 worker/preview 无法读取。`LocalVolumeSnapshotStore` 增加显式 `codeless.versions.shared-readers` 开关，在完整校验后、原子提升前设置目录 0750/文件 0640。默认关闭；非 POSIX 文件系统拒绝开启，不把私有卷改成全局可读。
2. 首次发布的服务端列表受全局 non-null 序列化影响，漏掉 `latestSuccessful:null`，前端据严格契约进入未知状态并禁用确认框。`PublicationService.Page` 显式保留该 nullable 字段，真实 HTTP 测试验证空 items 与存在的 null；前端原校验保留。
3. worker 严格 umask 使公开文件实际为 0640，Nginx 无法读取。发布 store 对已经筛选的公开文件显式 chmod 0644、公开子目录 0755；staging 父目录 0700、receipt 0600。新回归在独立子进程设置 umask 0077，并在 Linux 实查这些权限，未放宽 worker 全局 umask。

## 实际发布记录

| 项目 | 真实值 |
| --- | --- |
| 应用 ID | `834f36e1-4916-4fd2-bbce-2e54172483e6` |
| 被发布版本 | `72d80ae5-df91-4a9d-a5a2-da035789e268`，VERIFIED，真实 build SUCCEEDED/exit0、浏览器验证 PASSED |
| 冻结 artifact digest | `sha256:b8dbdd171ae24971d102cbde17a1a41a80c55d147d8b774800a6b9ceace57f87` |
| 成功发布 ID | `9f35ba94-b79e-8fb8-9361-da2498b8dbf5`，PUBLISHED；阶段 PREPARING → PUBLISHING → PROBING → SUCCEEDED |
| 并发编辑后版本 | `8dfbf5e9-7163-4ff0-b802-2ce5c372dada`，Hedy Lamarr；编辑请求被接受时原发布仍为 REQUESTED，后来应用 ready 指针切换，但旧公开页仍为 Ada Lovelace |
| 真实 HTTPS 探测失败 ID | `e7331447-5e99-8964-ba05-459665ba4104`，FAILED，`DEPLOYMENT_PROBE_FAILED`；阶段明确经过 PROBING |
| 不可发布的真实失败版本 | 应用 `d83b28da-198c-4477-85e3-420ecbf83582` 的 `cded4f60-49d7-4978-b3fd-7f89416f2168`，真实所有者 POST 返回 409 |

真实 UI 发出带 artifactDigest 和幂等键的三字段 POST；使用同一实际提交意图重放，返回相同发布 ID。
SQL 最终只有 **1 条成功记录、0 条未决记录**；另有两条独立的明确失败尝试，不能把它们算成重复点击产生的成功发布。
SQL 同时核对 owner、VERIFIED 版本、真实 build、source/artifact digest；编辑后的 latestReadyVersion 与被发布版本不同，成功记录仍锁定原版本。

失败场景仅将新尝试 JS 设置为 worker 可读、Nginx 不可读，原冻结字节仍可校验，原始生产 probe 实际通过公网 HTTPS 观察到失败。
没有篡改 probe 结果或 SQL 状态，没有修改旧成功资产。失败结束后恢复该文件权限，并将失败目录移到公开根之外。
服务端 latestSuccessful 及重新加载的发布面板均仍指向旧成功 URL；面板未在客户端缓存该成功 URL，而是重新读取服务器。

草稿、失败版本、未登录、越权、缺 CSRF、错误 digest 均拒绝发布。公开资产逐文件字节/hash 与冻结清单一致；源码、source map、私有 receipt、catalog 元数据、Git 文件、API 路径及目录不可公开读取。
独立外网浏览器验证首页、任务页、目录页及各自刷新；它们按模板分别展示首页、任务、目录，并非三个路由都应展示首页。

## 验证和证据

公开证据在 [evidence/D15-public-2026-10-18](../deployment/evidence/D15-public-2026-10-18/aggregate.json)。
其中只含公开 URL、UUID、hash、状态和检查结果；各分项保留 `publicMilestoneReached=false`，仅汇总设置 true。
私有 checkpoint、登录会话和失败截图始终留在服务器 `/srv/codeless/acceptance-private/`。

| 验证 | 实际结果 |
| --- | --- |
| 最终 `pnpm verify:runner` | native0，88/88，0 fail/skip，包含新 umask 回归 |
| Linux 非 root 发布与权限专项 + package | native0，18/18：PublicationIntegrationTest 7、SharedSnapshotPermissionsTest 4、LocalVolumeSnapshotStoreTest 7 |
| 本机最终受影响 API 专项 | native0，25/25，包含上述 18 项及 EditVerificationIntegrationTest 7 |
| Linux store/发布边界专项 | native0，5/5；严格 umask POSIX 权限实际检查通过 |
| worker 边界 | Linux 5/5；真实正向 IPC、任意命令拒绝、非 API peer 拒绝、API Docker 拒绝；实际中断清理与过期回收通过 |
| 同服务器真实浏览器 | 11 项检查通过；真实登录/会话、SSE、生成、受控预览、明确确认、幂等、并发修改、成功发布、真实探测失败保留旧成功 |
| 独立外部浏览器及 HTTPS | native0，正常 DNS/TLS、全部公开资产 hash、三个路由及刷新、未知 SNI 拒绝、源码/元数据拒绝、无发布域 cookie |
| 最终 SQL、角色、容器、权限与源码冻结 | 全部通过，源码冻结后再次只读核验通过 |

**全量 API 的准确状态**：首轮 `pnpm verify:api` native1，225 项统计中 1 个初始化错误为 `EditVerificationIntegrationTest` 的 `AGENT_CLEANUP_TIMEOUT`，导致该套件未完整运行。
原失败日志保留；其完整 7 项及最终改动受影响范围合计 25 项随后通过。没有提高超时、删除断言、降低并发或跳过测试。
这不是一次新的全量 API/CI 6/6 通过声明；合并前仍需对最终提交按仓库规则重新跑 CI 和独立复审。

其余失败历史均保留：Docker Desktop 未启动、worker readiness 与防火墙装配首轮错误、内部数据库不发布端口的连接调整、冻结权限、首次空列表契约、公开文件 umask，以及 Linux 测试以 root/无 HOME/漏测试准备脚本的环境问题。
第一种失败注入 chmod000 在私有冻结校验前失败，错误为 `DEPLOYMENT_FAILED`，对应 `bad4aabd-9f78-8a9c-89d5-0c4ba987e4a5`；没有将其计作 HTTPS 探测失败。
已另用上述 e733… 的原生产 probe 和明确 failureCode 完成该项。
外部复核首次请求超时和第二次脚本误把任务页当首页的断言失败也保留；最终外部请求预算为 30 秒，正式生产共同 deadline 未改变。

## 运行包与维护

- 分支 `codex/d15-integration-publication`，HEAD `fcc8e2f26ff4e2bc14bf86932d9da3fc39172583` 加工作区改动；没有修改 main、提交、推送、合并或删除分支。
- main 仍为 `572304e0cc21fbfe2e22cf7c286b4c3f29ad1013`。不能把 Git HEAD 单独视为当前部署源码；应同时使用冻结清单。
- 最终运行 JAR SHA256：`64718612f8a840d44b5e7ee09be4116c2b1fc230fa81ada8476bc5e73de9dc23`，来自通过 18 项测试的 Linux 非 root 构建；7 个运行提示资源逐字节与来源匹配。旧 JAR 位于服务器 root 保护的 deployment-patches 目录。
- 最终源码档案 SHA256：`95e0fe5b4d49a3ce0f35457f91c3a1e04328ecb57ee2ab5dc3184d3ccca98b19`，446 个文件逐一校验。已安装 worker 与来源按 LF 归一匹配，Linux mvnw 使用 LF；冻结后仅编写、更新交接文档，README 的文档 hash 差异单列在汇总证明。
- 服务端关键路径：`/srv/codeless/api.jar`、`repository/`、`web/`、`private/agent/`、`publication/sites/`；操作员程序 `/opt/codeless/ops/`。数据库保留原命名卷。
- 当前模型为 **deterministic-mock**，本次采用受控模型生成以验证真实构建/部署链路。这不代表任意自然语言需求或真实商业模型已验收；切换真实模型需要服务器端受保护配置与相应验收。
- 当前机器 2 vCPU、约 4 GiB RAM，用于本次低并发演示。worker 串行执行受控作业；没有作出持续并发容量承诺。
- TLS 到期为 **2027-01-16 09:19:27（北京时间）**。自动 DNS 续期尚未配置，应在到期前完成新一轮手工 DNS 验证或配置受限 DNS 自动化；现有 certbot.timer 不等于本证书可自动续期。五条旧挑战 TXT 可清理，现有 A 记录应保留。

自动审批曾拒绝把服务器登录凭据复制到本机，以及读取私有验收错误后回传脱敏内容，理由是仍有敏感信息泄露风险。
采用的替代方式是同服务器匿名管道登录和固定状态诊断；仅专门生成的无凭据公开证明离开服务器。
