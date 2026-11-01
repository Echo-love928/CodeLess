# D27 前端 / runner 候选发布包

本流程只产生候选文件，不启动生产服务、不发布生成应用。API JAR、迁移和数据库恢复由 D27-A 交付。必须将双方产物绑定同一完整提交；当前线上版本和历史 D15 示例不能当作 D27 部署证明。生产自动 cover 及真实生成质量的既有 HOLD 继续保留。

## 构建与核验

在任务分支提交后，使用锁定 Node 24.22.1 / Corepack pnpm 12.6.0、Git、tar：

```sh
node infra/release/client/package.mjs build <40位候选SHA> .local-data/d27-b/candidate-1
node infra/release/client/package.mjs verify <40位候选SHA> .local-data/d27-b/candidate-1/bundle
node --test tests/release/browser/package.test.mjs
```

输出目录必须全新；失败保留 `build-status.json`，不覆盖已有候选。源码通过 `git archive <SHA>` 取出，不读取本机未提交的产品代码或 node_modules。构建器自身必须与候选一致；域名配置也来自候选内 `infra/release/client/config.json`。环境只继承操作系统/工具缓存必要项，VITE 只设置已冻结的预览域名，模型/数据库/会话凭据不参与构建。

`bundle/web` 是实际 vue-tsc/Vite 产物，含公开发布域 JSON；`bundle/runner.tar` 是从同一提交直接归档的 Node ESM runner、Vue 锁定模板、隔离策略、镜像构建文件、网关和操作员适配器。runner 本身不编译；逐模块执行 Node 语法检查并导入主要入口验证相对依赖闭包。归档不是 Docker 镜像，不包含 API JAR、node_modules、浏览器二进制、TLS 私钥或环境文件。按现有 `tests/agent/prepare-runtime.mjs` 在可信宿主构建/检查固定 runner 镜像；镜像 tag 不等于不可变 image ID，实际运行证据仍以每次 runner 回执的 imageId 为准。

`manifest.json` 记录候选/tree、工具版本、源码归档/根锁/构建器/配置摘要，以及每个公开构建文件和 runner 归档的 SHA256/长度。分发时通过受信渠道另交付 manifest SHA256；校验器只提供完整性校验，不是签名或供应链来源认证。`source/`、日志和 `source.tar` 是本地构建材料，交付集合只取 `bundle/`。公开仓库不提交二进制包和原始运行日志。

重复到另一个全新目录构建同一提交，比对两个 manifest 的 files、commit、toolchain、config；这验证本轮实际字节复现，不承诺任意操作系统/工具版本均字节相同。不得用最终文档提交替换已构建候选身份。

## 候选环境部署步骤

1. 获取 D27-A 同提交 API/JAR/迁移、客户端 bundle 和受信 manifest 摘要；先核验摘要及 `verify`，禁止混用两个提交。既有备份/恢复与 A 的空环境迁移验证是启用前置。
2. 新建版本目录，展开 runner 归档保持仓库相对布局，在可信宿主按归档内原根锁运行 `corepack pnpm install --frozen-lockfile`，再以锁定 Playwright 安装 Chromium 及其系统前置；完成后设置版本目录只读。打包器已在单独展开的归档中真实执行 frozen install 及主入口/Playwright 导入，不借用前端安装目录。归档保留原根 package 元数据，根 CI scripts 需完整源码 checkout，不能在该运行包内调用。将 `CODELESS_AGENT_REPOSITORY_ROOT` 指向此版本；平台 dist 指向 `bundle/web`。保留旧版本目录及持久私有卷，不将新版本覆盖旧发布目录。宿主依赖安装不发生在生成代码容器内。
3. 通过私密渠道在服务器配置现有 `/etc/codeless/` 受保护配置，复用 `infra/public/README.md` 的服务账号、worker IPC、隔离镜像、私有根及防火墙。不要复制配置、密码、cookie 或 TLS 私钥到构建目录。API/preview 和生成容器不得取得 Docker socket。
4. DNS/TLS 必须覆盖三个独立站点：平台 `app.codeless-platform.top`、`v*.preview.codeless-preview.top`、`d*.sites.codeless-publish.top`（实际通配符为 `*.preview...` / `*.sites...`）。候选 `ingress/*.conf` 由现有正式 renderer 生成，预览网关8788、API8080保持私有；edge 只开放443。沿用 `infra/public/compose.yml`，将候选配置和 web 以只读挂载装配。先运行 compose `config --quiet` 和容器 `nginx -t`，再在候选入口启用。正式证书必须通过系统信任验证，不能 ignoreHTTPSErrors/hosts 覆盖冒充公网。
5. 复核 `infra/hosting/preflight.mjs`、`infra/public/host-preflight.sh` 与只读 `check-final.py`；按既有服务器验收入口使用全新 run-id 和实际 deployed SHA。它需要真实受保护 reviewer 会话及 API/runner，同一 SHA 身份核验不能省略。不要自动调用发布；真实发布需由已鉴权用户显式确认已验证不可变版本。
6. 外部新浏览器运行下述只读检查。再由操作员执行原 `run-acceptance.py` 和 `check-external.mjs`，核对预览桥 source/origin/version/nonce、Partitioned host-only cookie、实际源码 ZIP 与历史版本、失败保留旧站点。本地 `pnpm ci:gate` 包含真实双用户、Docker/Chromium、预览与下载链，但其本地 TLS fixture 不证明公网候选已部署。任一步失败均 HOLD，保持旧版本与原始失败记录；回退应用目录不得清除私有 journal/quarantine/业务数据。

```sh
node tests/release/browser/public.mjs <候选SHA> .local-data/d27-b/candidate-1/bundle .local-data/d27-b/public-1
```

该脚本使用正常 DNS/系统 TLS、无会话 Chromium，不请求登录密码、不改线上数据。检查平台和 D15 历史示例的资源、直达路由/刷新、匿名 API、内部路由拒绝、模拟 host-only cookie 和 LocalStorage 跨站隔离。公开报告明确该 canary 不是已登录账号；index 比对也不证明 API/runner 部署身份。登录预览、下载和真实会话隔离由受保护服务器验收及完整本地链另证。错误/未知均不写 PASSED。

## 公开入口和评审账户

- 平台：<https://app.codeless-platform.top>。
- 历史示例：<https://d9f35ba94b79e8fb89361da2498b8dbf5.sites.codeless-publish.top/>。仅为 D15 历史不可变发布，不代表 D27 新候选。
- 预览基准域和发布基准域本身不提供应用，需合法版本凭据或发布 ID。
- 评审账号由部署维护者在既有私密渠道按受控试用名单交付。服务器随机初始凭据仅保留 root 0600 文件；本说明不列密码、不读取/复制它。需要评审者尚未获账号时，由维护者私下提供；不能用仓库示例数据库口令或合成 canary 登录。

当前执行结果、候选 SHA、证据与阻塞见 `docs/handoffs/D27-B.md`。未经另一人批准、当前 HEAD 全部门禁成功和无未解决讨论，不具备合并条件。
