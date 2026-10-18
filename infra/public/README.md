# D15 实际公网部署

此目录是 2026-10-18 在 `23.136.172.128` 验证过的操作员装配，使用三个独立注册域名。
最终结果、实际发布地址、失败记录和使用限制见 [部署验收交接](../../docs/handoffs/D15-public-acceptance-2026-10-18.md)。

## 入口与职责

- `compose.yml`：只由 edge 将主机 443 转入受限 SNI 路由。platform 提供平台与受控预览，hosting 仅提供已筛选的静态资产。数据库在独立 internal 网络，没有发布数据库端口。
- `render.mjs`：复用正式预览/托管模板和共享站点策略。未知 SNI 关闭连接，平台、预览、发布分别属于独立主域。
- `install-runtime.py`：root 安装操作员文件、服务用户与受保护配置。首次生成的随机密码只写服务器 root 0600 文件；重复执行不旋转既有密码。安装本身不启动入口，也不自动启用发布。
- `worker-client.py`、`worker.py`：API 通过带 Linux peer UID 校验的私有 Unix socket 访问固定 Node 入口。调用者不能传任意命令、环境、输出根或 Docker 参数。
- `docker-job.py`、`reap.py`：为实际 worker 创建的容器添加独占任务标签；连接中断或 deadline 到达时清理自有任务，timer 回收超过 300 秒的自有遗留。无标签容器不被该 reaper 删除。
- `protect-backends.sh`：仅在专用链限制 8080/8788，允许 loopback 与确定 ingress bridge；保留既有 SSH、防火墙规则。

API、preview 和生成容器都没有 Docker socket 权限。只有受信 worker 操作 Docker；该权限具有宿主机管理能力，不能赋予生成代码。
API 使用 `codeless.versions.shared-readers=true` 将已冻结的 source/outcome 设置为组只读，缺省配置仍是原有私有模式。
公开发布文件显式设置为 0644、公开子目录 0755；staging 父目录 0700、私有 receipt 0600，不依赖 worker 的 umask。

## 在已装配服务器上检查

通过既有 SSH 登录后执行，避免把 `/etc/codeless/*.env`、cookie、checkpoint 或私钥复制到本机或仓库：

```sh
sudo systemctl is-active codeless-api codeless-worker codeless-preview codeless-backend-firewall codeless-reap.timer
sudo docker compose --env-file /etc/codeless/compose.env -f /srv/codeless/repository/infra/public/compose.yml config --quiet
sudo python3 /srv/codeless/repository/infra/public/check-final.py
```

`check-final.py` 只读核对 SQL、角色、容器、冻结目录和公开资产，输出的证明不含凭据。
不要把未加筛选的 `docker inspect` 或完整 compose 展开结果打印到聊天，因为数据库容器配置包含密码。

## 验收工具的边界

- `check-worker.py` 为私有 IPC 边界 fixture，`check-worker-cancel.py` 验证真实 Docker 隔离与中断清理；它们不能代替一次真实发布。
- `run-acceptance.py` 是本次同服务器受保护操作员入口。它在匿名管道内完成登录，Chromium 由没有 Docker/IPC/共享私有卷权限的独立 evaluator 运行；凭据不离开服务器。
- `acceptance.mjs` 通过真实平台 UI、真实 API、SQL、Docker、预览与公网探测完成发布。只有模型使用明确标识的 deterministic-mock，不使用路由拦截、签名 fixture、hosts 覆盖或关闭 TLS 校验。
- 失败注入只对新尝试的资产去掉公开读取权限，保留 worker 自身读取，以保证实际到达 HTTPS probe；旧成功资产不修改。待数据库返回 FAILED 后还原权限并把该失败目录移出公开根。
- 此操作员入口固定了本轮 evidence 目录与一个保留的真实 FAILED 版本应用 ID；checkpoint 可续查本轮。开始全新轮次时须创建新 evidence 目录并显式选择该轮真实失败版本，不能把旧结果当作新部署证明。
- `check-external.mjs` 在独立本机运行，只需要非敏感公开证明，不需要登录密码。正常 DNS/TLS 获取各资产并核对字节/hash，再用无登录 Chromium 验证首页、任务、目录和刷新。其 30 秒外网请求预算不修改正式 probe 的 30 秒共同 deadline。

```sh
node infra/public/check-external.mjs <public-acceptance.json> <evidence-directory>
```

各分项证明保留 `publicMilestoneReached=false`；只有独立外部访问、服务器 SQL/隔离、真实成功及真实探测失败都通过后，汇总证明才设置 true。
TLS 到期时间为北京时间 2027-01-16 09:19:27，目前采用手工 DNS 验证，自动续期尚未配置。
