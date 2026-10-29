# 从全新目录安装 CodeLess

先准备工具，再选择自动 Mock 演示或持续开发服务。不依赖开发者的 .local-data、全局 pnpm 或已启动数据库。Mock 成功不代表公网或真实模型验收成功。

审查尚未合并的 PR 时，clone 后先切到该 PR 的 head 分支，再执行后续命令；合并后从 main 安装。确认当前 checkout 已包含本指南与 tests/install，测试记录的精确基线和文件摘要见 D23-B 交接。

## 1. 获取与工具准备

安装 Git、Node **24.22.1**（含 Corepack）、Java **21 JDK**、Docker Engine/Compose v2。首次需访问 npm、Maven、镜像仓库和 Chromium 下载地址。Windows 使用 Git for Windows 的 OpenSSL，Docker Desktop 运行 Linux 容器。

```sh
git clone https://github.com/Echo-love928/CodeLess.git codeless
cd codeless
corepack enable pnpm
node --version
pnpm --version
java -version
docker info
docker compose version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
node scripts/verify-versions.mjs
node --test tests/install/install.test.mjs
```

应得到 Node v24.22.1、pnpm 12.6.0、Java 21。JAVA_HOME 指向 JDK 21，java/javac 在 PATH。无需全局 Maven，使用仓库 Wrapper。Linux 若缺系统库，用 `pnpm exec playwright install --with-deps chromium`。

Windows PowerShell：替换成实际 JDK 21 路径，用户目录 shim 避免 Node 目录不可写或旧全局 pnpm 抢先解析。

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21.0.12.1'
$shimDir = Join-Path (Get-Location) '.local-data/corepack-bin'
New-Item -ItemType Directory -Force $shimDir | Out-Null
corepack enable --install-directory $shimDir pnpm
$env:Path = "$shimDir;$env:JAVA_HOME/bin;C:/Program Files/Git/cmd;$env:Path"
node --version
pnpm --version
java -version
docker info
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
node scripts/verify-versions.mjs
node --test tests/install/install.test.mjs
```

每个新终端都要准备 PATH/JAVA_HOME。嵌套脚本会调用 pnpm，仅在外层用 corepack 不足以排除旧全局版本。不要删除 frozen-lockfile 或升级工具来规避失败。

## 2. 自动 Mock 全产品演示

在仓库根执行（Windows/bash 相同）：

```sh
node tests/e2e/full/record-command.mjs full
```

自动准备锁定构建镜像、编译 API/测试组合、创建独立 PostgreSQL 17.6、执行 Flyway 并断言初始业务表为空。两个普通用户在真实 Chromium 中完成创建应用 → Mock 生成 → READY → 预览 → 组件编辑 → 用户点击发布 → 下载源码。还验证真实失败构建保留旧版本、跨用户访问拒绝等。模型明确为 deterministic-mock，无付费外呼；托管探测是本地 HTTPS fixture，不证明公网 DNS/TLS。

预期原生退出 0，命令与业务 run.json 均为 PASSED。截图、ZIP、SQL、API/浏览器日志在 `.local-data/d20-b/runs/<本轮>/`；命令退出码和源码摘要在 `.local-data/d20-b/commands/<本轮>/run.json`。失败保留 FAILED，检查同轮 command.log、api.log、browser.log 和 trace。输出可能含会话和私有路径，只提交审核过的匿名摘要。

结束后清理本轮进程和容器；持续交互服务见下一节。不要把测试账号和本地证书用于共享环境。边界见 [全产品演示说明](../tests/e2e/full/README.md)。

## 3. 持续本地开发：数据库、登录和应用管理

复制配置（bash `cp .env.example .env`；PowerShell `Copy-Item .env.example .env`，已有文件不要覆盖）。在私有 .env 设置不同且至少 12 字符的 CODELESS_DEMO_PASSWORD、CODELESS_ADMIN_PASSWORD。二者都空不创建账号，只填一个会启动失败。只用于隔离本地环境。

```sh
node infra/check-config.mjs .env
docker compose --env-file .env -f infra/compose.dev.yml -p codeless-d23-local config --quiet
docker compose --env-file .env -f infra/compose.dev.yml -p codeless-d23-local up -d --wait postgres
docker compose --env-file .env -f infra/compose.dev.yml -p codeless-d23-local exec -T postgres pg_isready -U codeless -d codeless
```

Compose 不启动宿主 API/Vite，--env-file 也不会给宿主 Java 注入配置。infra/check-config.mjs 仅检查开发数据库/网关配置，不验证模型或全部生产配置。

导入只适用于本指南受信任的 .env.example 副本，格式 NAME=value，不支持引号、插值、多行值，不导入外部任务文件。bash：

```sh
set -a
. ./.env
set +a
./services/api/mvnw -f services/api/pom.xml spring-boot:run
```

PowerShell（不执行文件内容，不打印值）：

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
.\services\api\mvnw.cmd -f services/api/pom.xml spring-boot:run
```

第二个已准备 PATH 的终端执行 `pnpm --filter @codeless/web dev`。访问 http://127.0.0.1:8080/api/health 应为 UP；打开 http://127.0.0.1:5173/login，以 demo@codeless.local 或 admin@codeless.local 和私有配置的密码登录。CODELESS_COOKIE_SECURE=false 只适合回环 HTTP，生产 HTTPS 必须 true。初始化不会给既有账号重置密码。

基础启动用于登录和应用管理；完整生成/预览/发布还需要 Agent 的 codeless.agent.enabled/repository-root/private-root、Node、私有存储、预览签名/注册密钥、独立站点和托管配置。默认关闭发布，D02 Compose runner 只提供健康检查。参考 [runner](../infra/runner/README.md)、[preview](../infra/preview/README.md)、[hosting](../infra/hosting/README.md)；首次完整验收优先使用第 2 节自包含演示。不要给健康容器挂 Docker socket 或仅设发布标记冒充已配置。

停止：API/Vite 各 Ctrl+C，再执行 `docker compose --env-file .env -f infra/compose.dev.yml -p codeless-d23-local down`。保留数据库卷；只有明确要永久删除本地演示数据时才另行清卷。

## 4. 真实模型与一次请求

当前只支持 deterministic-mock 和 deepseek；真实 provider 固定实现中的 DeepSeek HTTPS 地址，不支持任意 base URL。私有环境设 CODELESS_MODEL_PROVIDER=deepseek，CODELESS_MODEL_NAME 填账号实际可用模型名，CODELESS_MODEL_API_KEY 通过秘密环境注入。不提交、不打印密钥，也不放在命令参数中。运行中 API 改配置须重启。

先打包 API，再执行已有单次 PLAN 验收：**最多 1 次请求、2048 输出 tokens、60 秒、不重试**，不证明完整生成质量。PowerShell（先在当前进程加载私有配置）：

```powershell
.\services\api\mvnw.cmd -f services/api/pom.xml -DskipTests package
powershell -NoProfile -File tests/model/run-real-plan.ps1 -Evidence .local-data/d23-b/real-model
```

bash：

```sh
./services/api/mvnw -f services/api/pom.xml -DskipTests package
java -Dloader.main=dev.codeless.api.model.PlanAcceptanceCli -cp services/api/target/codeless-api-0.0.0-SNAPSHOT.jar org.springframework.boot.loader.launch.PropertiesLauncher .local-data/d23-b/real-model
```

-DskipTests package 只打包，不代表 API 门禁通过。退出 0 且 t4-result.json 为 SUCCEEDED 才是本轮真实请求证据；缺配置退出 2/BLOCKED、requestsStarted=0，外部错误退出 1/FAILED。核对 provider、实际模型、请求标识与 usage，未知用量保留 null。真实请求可能收费，按上述单次边界执行，Mock 不替代 T2。

## 源码包独立运行

版本面板选择拥有的 VERIFIED 版本下载 ZIP。解压进入 codeless-<versionId>，按包内 README 指定 Node/pnpm 执行 install --frozen-lockfile、run build、exec vite preview，访问默认 4173。无需平台 API、数据库、.env 或模型凭据。实际版本以包内清单为准，[说明模板](generated-project-readme.md) 仅展示格式。

在仓库根对本次 ZIP 作独立容器验收（替换 ZIP 路径，输出目录必须全新）：

```sh
node tests/export/verify-export.mjs <download.zip>
node tests/export/clean-build.mjs <download.zip> .local-data/d23-b/export-clean
```

clean-build 使用固定摘要 Node 镜像、全新 pnpm store，只读挂载导出文件，不挂仓库依赖或秘密。预期退出 0、clean-build.json.status=PASSED、hostProjectUnchanged=true、hostNodeModulesCreated=false。旧样例可能记录旧工具链，应从当前版本重新导出，不篡改 manifest。若指定 --expect-artifact-digest，产物不匹配退出 3；构建成功与逐字节复现分开记录。

## 5. 门禁与交付

依次执行 README 的四类 verify:* 与 pnpm ci:gate；专项为 `node --test tests/install/install.test.mjs`。失败、缺凭据、Docker/网络不可用都保留真实结果。远端 CI 还包含 infra-preflight，按 PR 最终 HEAD 单独确认。安装证据、D23-A 运维对接与未完成项见 [D23-B 交接](handoffs/D23-B.md)。
