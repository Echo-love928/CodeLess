# D15 公网主机准备记录

日期：2026-10-17（Asia/Shanghai）。用户已明确要求恢复原服务器方案的真实公网部署与验收。
本记录不代表公网验收完成，也不修改既有历史测试结论。

## 已核实和已执行

- 使用用户给出的 `ssh huangjiaqi@23.136.172.128`，现有密钥认证成功；严格核对已有 known_hosts，未关闭主机密钥检查。
- 系统 Ubuntu 24.04、x86_64，2 个逻辑 CPU，内存 4,009,852 KiB；首次盘点可用内存约 3.4 GiB，无 swap。
- 初始磁盘可用 37,439,968 KiB；基础软件和 Nginx 镜像准备后可用 36,265,492 KiB。
- 操作员账号支持 `sudo -n`；基础安装使用 sudo，不向该账号增加 Docker 组权限。
- 安装 Java 21 JDK（Ubuntu 包 `21.0.12.1+1-1~24.04.4`）。
- 从 Node 官方发布目录下载 24.16.0 Linux x64，核对官方 SHA-256 后解压至
  `/opt/codeless/tools/node-v24.16.0-linux-x64/`；未替换全局 Node。
- 按 Docker 官方 Ubuntu APT 流程安装 Engine/CLI `29.9.1`、containerd `2.4.2`、
  Buildx `0.38.0`、Compose `5.6.0`；Docker daemon 为 active。
- 拉取 `nginx:1.27.5-alpine`，实际镜像 digest 为
  `sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10`。
  在无网络、非 root、只读、无 capabilities 的临时容器中执行 `nginx -V`，退出 0，
  确认包含 `--with-stream` 与 `--with-stream_ssl_preread_module`。这只是模块前置检查。
- Docker socket 为 `0660 root:docker`；操作员组为 `huangjiaqi users`。
- 安装后只发现 TCP 22 和本机 DNS 53 监听；没有开启应用公网端口、启动 CodeLess 或变更 SSH。

新增 `infra/public/host-preflight.sh` 和 `bootstrap-host.sh`，均经过 `bash -n` 语法检查。
安装脚本在目标服务器实际执行退出 0；Nginx 前置检查命令退出 0。
首次盘点通过 PowerShell stdin 传输时，末尾额外 CR 导致 shell 退出 1；随后在传输层过滤 CR，
原只读盘点退出 0。没有将首次异常记为通过。

原始安装、Nginx 核验输出及退出码位于被 Git 忽略的
`.local-data/d15-public-2026-10-17/`。这些输出不包含凭据。

## 尚未完成

1. 三个独立主域名及 DNS 控制权尚待用户提供；TLS 尚未签发与配置。
2. 三站点统一 SNI 443 入口、受信 worker 与 API 的 Docker 控制权限分离仍待实现和验证。
3. 应用源码、Java API、PostgreSQL、预览及托管服务尚未安装到目标运行目录。
4. 可信构建镜像、Chromium、Linux 真实构建/浏览器链路、资源与 deadline 尚未实测。
5. 公网资源预检、鉴权发布、外部访问、摘要绑定和失败不覆盖旧成功记录等验收尚未执行。
6. 新部署代码需要本次候选自身的检查和独立复审；历史 CI 6/6 不覆盖这些新增文件。

`PUBLIC_ACCEPTANCE=NOT_RUN`，D15 真实公网验收仍为 `BLOCKED`，不能宣称 `PUBLISHED` 或关闭公网债项。
2 核约 4GB 是实有配置，是否能在既定限制内完成链路仍需实测，未承诺容量足够。

本地仍位于 `codex/d15-integration-publication`，基线
`fcc8e2f26ff4e2bc14bf86932d9da3fc39172583`；未修改 main、未合并、未推送。
未重跑之前暂停的全量本地测试；本次只执行部署准备所需的语法与目标主机检查。
