# D15 A/B 集成：网关装配、契约登记与公开启用准备

> 2026-10-18 更新：统一 HTTPS、worker 隔离、实际部署和真实公网发布验收已完成。
> 最新地址、受控探测失败及外部浏览器证据见 [公网部署验收交接](D15-public-acceptance-2026-10-18.md)。
> 下文 2026-10-15 的 BLOCKED 为历史状态，不代表当前服务器状态；本次仍未合并 main。

2026-10-15，Asia/Shanghai。用户在完成A/B互审后明确要求解决装配、共享契约、组合门禁及公网验收。
本次由该集成分支执行共享 OpenAPI 登记，不改根锁、兼容版本、CI工作流或迁移编号。

## 分支与来源

- `codex/d15-integration-publication`，从B `33b3b603a46dc0554a3491b30da4e175c0e49168` 建立，
  无冲突组合A `4ea141a8c51b38c54eb330fc0d25c36b7042e102`。两者已独立批准；本次新增装配仍须独立复审。
- main/base仍 `572304e0cc21fbfe2e22cf7c286b4c3f29ad1013`，原A/B任务分支未修改，未合并main。
- Git HTTPS不可用，A最新提交通过官方Git API与已逐blob核验的精确档案导入；14个元数据blob、完整tree
  `be2d4b494d86fe351babc4e53f61ef5689cdc4b3`、原commit SHA全部相同后才组合，未重写A历史或使用近似候选。

## 已完成的集成改动

- 正式API源码安装 `deploy/NodeDeploymentGateway.java`，由 `DeploymentConfiguration` 注册。
  默认不可用；只有 `CODELESS_PUBLICATION_ENABLED=true` 才读取六项受控路径/origin。
  启用后缺配置、非绝对/不可用路径、同站点、非法origin/端口使启动失败。私有Node子进程不继承平台/模型/DB凭据。
  B原Java文件仅保留为历史独立安装模板；实际API编译和组合测试使用新安装的正式源码。
- `application.yml` 将操作员环境绑定到网关属性；API与受信Node/Docker主机须能访问同一hosting路径。
  30秒共同deadline、冻结字节重算、隔离目录、真实DNS/TLS/hash probe及SQL成功判定保持原样。
- `contracts/openapi.v0.json` 登记A全部四条路径及严格三字段/key契约，CreatePublicationRequest引用严格schema。
  `tests/deploy/contracts.test.mjs` 核对共享路径与A差异完全一致，纳入既有静态门禁；不再依赖未登记的私有组合契约。
- 新配置测试验证缺资源默认失败、启用配置不完整拒绝启动、恰好一个真实网关bean、相对路径/同站点/非法端口拒绝。
  A原六项HTTP集成断言保留，新增第七项通过正式配置工厂、实际Java类和Node进程发布冻结资产，
  逐文件字节相等，缺公网DNS时真实probe失败且SQL/list旧成功保持。
- `infra/hosting/publication.env.example`、`prepare.mjs`、`preflight.mjs` 提供操作员配置、Nginx/平台JSON准备及公网资源检查。
  检查锁定Node、Docker、精确渲染配置、通配证书有效期/SAN、IPv4公网DNS、DNS固定及正常TLS校验，
  并核对平台实际提供的静态配置。未知/缺失/重定向/私网/不匹配均失败；不创建发布，不把预检当公网成功。

## 验证与证据

新增集成证据在 `tests/e2e/deploy/evidence/integration-2026-10-15/`，保留原始命令退出码与日志hash；
源文件哈希采用Git文本LF归一。旧A/B失败记录不覆盖。

| 验证 | 本地实际结果 |
| --- | --- |
| `mvnw.cmd -f services/api/pom.xml -Dtest=PublicationIntegrationTest,DeploymentRecordsTest,PublicationGatewayConfigurationTest test` | native0，13/13，0failure/error/skip，真实PG/Docker/Chromium与正式Java→Node→静态资产；成功种子和原probe仍明确fixture。 |
| 最终配置定向 `-Dtest=PublicationGatewayConfigurationTest test` | native0，3/3，包含最终非法端口拒绝。 |
| `pnpm verify:static` | native0，前端103/103、类型/lint/生产build、原契约及登记部署契约3项均通过。 |
| `pnpm verify:runner` | native0，82/82，0fail/skip，含缺公网配置native2与拒绝共享站点/含凭据origin。 |
| `pnpm verify:e2e` | 最后native0，默认并发54/54、0skip，含真实本机Nginx HTTPS托管与浏览器场景。 |
| 契约+资源定向 | native0，6/6。 |
| `node infra/hosting/preflight.mjs` | **native2 / BLOCKED**，11项操作员参数缺失，publicMilestoneReached=false。 |

本地首轮完整E2E native1，测试未发现：旧临时审查/历史集成目录的依赖junction造成Playwright1.60被加载两次。
原日志保留。仅在实际仓库执行 `corepack pnpm install --frozen-lockfile`，统一解析路径后原命令54/54通过；
没有改变依赖版本、锁文件、测试并发、超时、断言或跳过测试。

完整API与其余必需CI由**本集成最终HEAD自身**重新执行；状态必须读取其PR实时checks，不能借用A219或B210的旧检查。
本地本次未重复耗时较长的全量API；定向13项不冒充全量门禁。
`ci-gate`尚未完成时不得称完整组合门禁成功；不得据任何本机fixture宣称公网成功。

## 公网启用仍被外部资源阻塞（2026-10-15 历史状态）

用户确认“不清楚”已有公网资源。当前未获得Docker服务器连接或受保护部署配置，环境没有部署参数，
只有 `.test` 本地示例；没有可用的真实平台/预览/发布域名及通配证书。
因此本次不可能如实产出真实公网成功地址；没有创建收费资源、假域名、绕过TLS/DNS，或把公开失败改成功。

需要提供：一台可运行现有API/Node/Docker的公网服务器及操作员访问方式；
平台、预览、发布三个独立站点的实际域名；发布域名的通配DNS/TLS和入口443。
本v0 probe仅接受公网IPv4 DNS；不提供账号/凭据时不能代替所有者开通和接管服务器或DNS。
后续只需告知现有服务器/配置位置，秘密放受保护文件或既有账户连接，不能写入仓库/生成容器。

部署者在主机加载受保护的publication.env，按以下顺序继续：

1. 建立hosting目录与其私有同文件系统staging父目录，准备三站点DNS/TLS。
2. `node infra/hosting/prepare.mjs` 生成Nginx配置和平台静态配置。
   平台须在 `/codeless-publication-config.json` 提供该JSON（或按相同origin构建前端）。
   给固定UID101配置/证书/私钥的读取ACL，保持staging和私有API卷不可公开。
3. `docker compose --env-file <protected-file> -f infra/hosting/compose.yml config`，确认后 `up -d`。
4. `node infra/hosting/preflight.mjs` 必须native0 / READY_TO_ENABLE；这仍不是一次发布。
5. 同一受保护环境设 `CODELESS_PUBLICATION_ENABLED=true` 启动API，保留默认用户鉴权/CSRF/owner和明确发布确认。
6. 已鉴权所有者在真实平台打开VERIFIED版本，确认后点击发布，等待真实PUBLISHED及匹配version/artifact；
   实际访问根页/刷新tasks/catalog、缺失JS404、源码/map/目录不泄露；再验证失败版本不覆盖旧成功地址。
   保存SQL/部署报告和外网浏览器证据。任何一步失败，publicMilestoneReached保持false。

仍是草稿，新增集成改动须另一人复审，所有最终HEAD门禁成功后才可评估合入；不自批、不推main、不自动合并。
开发与运行时token无实测计量，UNKNOWN；本次固定deterministic-mock，不以其证明真实模型质量。
