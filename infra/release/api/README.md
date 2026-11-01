# D27-A API 候选发布包与恢复

这是操作员工具，不是模型工具或用户提供 shell 的入口。固定候选身份在 `tests/release/api/candidate.json`，源提交必须是完整40位 SHA。最终交接提交可以追加测试报告；不能偷偷重建并换掉同一候选包。共享发布根分为 `api/` 和 `client/`，本工具只生成 `api/`。B 的 client/runner 复现、组合验收和批准完成前保持 HOLD。

## 构建、封存与验证

在仓库锁定 Java21、Maven3.9.11、Node24.22.1、pnpm12.6.0 下：

```sh
python -B scripts/release/api_release.py build --revision <40位候选SHA> --output <全新release根>/api --log <包外受保护build.log>
python -B scripts/release/api_release.py verify --package <release根>/api --manifest-sha256 <独立保存的release.json摘要>
```

构建器从 Git blob 白名单提取 API 主源码、Maven wrapper、运行时契约/提示词、Vue模板、runner、共享站点策略、安装/备份/发布工具及手册；不取开发 checkout、旧 target/JAR、测试类、秘密或 node_modules。包外全新 build 目录执行 `-DskipTests package`，退出非零不封存，不删除失败目录，不覆盖既有包。此命令明确只打包；必需门禁另执行，不能据此报告测试通过。

包中 `api.jar` 是真实 Spring Boot 主类可执行包；`repository/` 保留精确 Git 字节及每项 gitBlob/SHA256 来源。`release.json` 列全体文件大小/SHA256、源码候选、工具链、构建日志摘要和 HOLD 状态；`SHA256SUMS` 含 manifest 本身。校验器要求包外可信 manifest 摘要并核对全部文件，篡改、缺件、多件、大小写别名、链接、硬链接及不受控路径均拒绝。SHA256不是签名；操作员需在受保护交付渠道保存 manifest 摘要并收紧 release 写权限。传输后、安装前及恢复后再次 verify。

`configuration.json` 是配置名称清单，无真实值。环境凭据、TLS、Docker配置和会话均不属于包。参考包内 `repository/infra/public/install-runtime.py` 配置最小权限、独立 origin、IPC 和容器隔离；API/preview/生成容器不得获得 Docker socket 或平台密钥。包内 runner 是 API 的固定依赖源码，不取代 B 的构建/浏览器/runner 发布复现。

## 空库与迁移演练

`tests/release/api/live.py` 在独立临时根/随机 loopback 端口/固定PG17.6镜像运行同一个已校验 JAR，使用生产 main，不加载 fixture Java类。T1从无用户对象库执行真实 Flyway V1–V5、读取认证入口，确认未配置密码不会产生默认账号、匿名读版本401。T2是**显式合成历史演示库 fixture**：用该包 Flyway target=4 建表，插入已标识历史版本/构建/发布/源码；备份并恢复到第二独立空 cluster，再启动该包迁移至5，验证旧 ID/摘要/最新指针/发布及登录/源码HTTP读、未知来源保持null、非法访问和篡改失败。它不代表实际运营演示库备份已验收，不证明历史构建本身真实执行。

实际演示库需操作员提供受保护的一致性备份，按下一节在独立主机恢复后重复 owner 登录、版本/源码/预览/导出/发布历史读。没有这份实库证据时登记 T2 的运营部分 BLOCKED；禁止读取未知现有数据库或把合成 fixture 称为实库。

## 与候选绑定的成组备份、恢复和回退

1. 记录源/目标候选SHA、可信API manifest摘要、B client manifest摘要、配置版本和原绝对数据根。在维护窗口停止所有写入者；先按包内 `repository/docs/operations.md` §2停写，API、preview、worker、reap timer/oneshot、其它副本全部核验。不能只复制数据库或 JAR。
2. 将 D23 backup 配置的 release 根设为包含**当前部署同字节** `api/` 与 `client/` 的封存根，其余根包括 agent、workspaces、modelAudit、fileAudit、hosting、必要外置versions/deployments/adminAudit。保留之前可用版本。操作员在机密位置运行包内 `repository/scripts/backup/backup.py backup` / `verify`，具体参数见 operations §2。真正备份含账号哈希/源码，不提交仓库。
3. `python -B scripts/release/api_release.py verify-backup --backup <备份根> --manifest-sha256 <源版本API摘要>`：先执行未改动的D23全备份校验，再校验 `data/release/api`，输出backupId、备份manifest摘要、API候选SHA/摘要。回执放在**备份目录外**，同B client摘要、数据库schema/Flyway版本和源数据根机密记录一起保存；校验成功只表示离线完整性。
4. 按 operations §3恢复至独立空PG17.6 cluster/从未存在staging，保持外部流量关闭。先恢复源版本全套数据和release；核对backupId及上述摘要，执行源版本的 `check-restored`。数据必须落原绝对路径，不能改写journal/receipt/hash；重建原UID/GID/ACL、TLS和秘密，旧票据重登录。源/目标数据库必须独立，失败保留现场，不清库覆盖。
5. 对恢复的 `api/` 再verify、对B的 `client/` 按其清单verify。先用 `configuration.json` 的恢复启动参数禁用任务、agent、发布worker、sweep和cover，生产main以恢复环境数据库启动，Flyway真实validate/migrate。V1–V5不修改，不新增迁移编号；禁止clean、repair抹平checksum、降级schema、手工改状态成功。迁移非零保持停止/离线，日志只留机密位置。
6. owner新登录，核对旧版本ID、source/artifact摘要、latestReady、历史发布；HTTP源码内容/ZIP校验和、固定Vue模板的独立构建、预览刷新及匿名/跨owner拒绝按operations §4执行。记录命令、退出码、hash、时间和截图；静态健康200不足以启用。生产Linux停写、异机ACL和RTO仍必须实测。没有全部证据/独立批准保持HOLD。
7. 失败回退为**恢复迁移前成组备份到另一独立空环境**，使用源候选的api/client、源码/模板/runner及原绝对卷布局。不得把旧JAR直接指向已前迁数据库；不在迁移后数据库执行降级SQL、不覆盖旧可用publication。恢复与只读验收通过后，按既有鉴权/用户显式发布流程、另一人批准和运维窗口再切换。此工具不会自动启用、部署或切流。

新候选必须有自己的包/manifest/证据目录和门禁，不继承D23/D26/其它HEAD的成功。前置D26真实质量、公网capture、历史故障归因HOLD继续保留；发布准备不构成解除条件。
