# D19 runner 与站点隔离

基线 `3ec4b99fbc262aef20e72c23cfe34d0da0740ef9`。本专项沿用 D01 固定版本，不新增模型工具、依赖、公共契约或网络权限。

## 持续门禁

`tests/infra/security-runner.test.mjs` 由既有 `pnpm verify:runner` 的 glob 发现，因此现有 CI runner job 与依赖它的 ci-gate 会执行本专项。11 项测试没有 skip、retry 或可选的基础设施降级。Docker、Chromium、TLS fixture 或断言失败均为非零退出；测试预期的安全拒绝只有在拒绝、目标未收到请求、清理等断言成立后才通过。

```powershell
corepack pnpm install --frozen-lockfile
node tests/security/runner/record-command.mjs security
# Windows 全阶段使用既有 Java21 和固定 pnpm shim
New-Item -ItemType Directory -Force .local-data/d19-b/bin | Out-Null
corepack enable --install-directory .local-data/d19-b/bin pnpm
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
node tests/security/runner/record-command.mjs gate
```

Linux 直接使用锁定 Node24.16.0、pnpm12.6.0、Java21 与 Playwright1.60.0；不得用 root 宿主账号运行构建测试。需要 Docker Engine、D05 镜像构建所需缓存/网络、锁定 Chromium、nginx:1.27.5-alpine 和 openssl。没有安装浏览器时不能冒充通过。`record-command.mjs` 保存命令、原生退出码、源码 SHA256、日志 SHA256 和每项结果；完整日志在 `.local-data/d19-b/<run>/`。它备份并还原旧测试自动生成的历史证据，实际新产物保留在对应 run，不篡改历史失败。

## 边界与可复现证据

| 子项 / 验收 | 测试与断言 |
| --- | --- |
| D19-B-01 / T1 | `build.test.mjs` 的固定测试镜像调用生产 `createBuildRunner`。非 root、只读根/输入、无宿主目录/socket/secret；宿主注入明确命名的三种秘密 fixture 后，容器仍不可见。对公网、10/172/192管理网段、169.254及100.100元数据连接要求明确 ENETUNREACH/EHOSTUNREACH/EACCES，超时不能当作拒绝证据。 |
| D19-B-01 / T2 | 同测试镜像真正启动子进程，父任务2秒截止后真实 exit137、TIMEOUT、无产物、容器与工作目录已删除；独立 docker ps 为空、inspect 确认 No such container。回收依据为 Docker 终态及整个容器 PID namespace 被移除，不以宿主 Windows 的 PID 列表替代 Linux 容器进程。 |
| D19-B-02 / T1 | `network.test.mjs` 拒绝私网/元数据/保留/IPv6/数字地址；25种 HTTP redirect 状态与目标组合只允许第一次固定 HTTPS 请求，不跟随 Location。绑定地址由自有 lookup 返回，TLS/SNI证书校验未关闭，拒绝未知文件、超量字节、同长度篡改与挂起流。 |
| D19-B-02 / T4 | `browser.test.mjs` 对真实私网 canary 的 fetch/导航和 metadata/WebSocket 攻击失败且 canary hits=0；真实 Chromium 忙循环无法通过验证。截图在真实 Chromium 执行私网导航、WebSocket与忙循环，均失败、无PNG且确认 browserClosed。 |
| D19-B-03 / T3 | `site.test.mjs` 使用真实预览 gateway、TLS nginx 和 Chromium，在同一浏览器上下文种入平台 HttpOnly会话、普通Cookie、LocalStorage和SessionStorage。预览读取 parent、公开站点读取 opener 都抛 SecurityError；生成站点自身存储无平台值，gateway 未收到平台Cookie。 |
| D19-B-04 / T4 | 同站点测试执行生产 selector-session 与真实桥的握手；错误 nonce/sourceDigest/schema/instance/source/origin 六类消息不触发选择，合法原生postMessage成功一次，close后重放无效。公开 CSP 阻止 inline script/iframe embedding，正常外部脚本可运行；六类私有/未知托管路径404。`store.test.mjs` 另对 writer 路径越界、ADS、编码、设备名、大小写别名、文件数/字节配额与调用后输入变更作回归。 |

## 修复记录

1. `publish/store.mjs` 原来仅依赖上游验证，直接接受 `../escaped` 部署ID；输入 Buffer/Map/receipt 在调用后变化会进入落盘内容。测试先真实失败，现写入前强制 UUID、公开文件白名单、设备名/别名限制、2000文件/32MiB和1MiB receipt上限，并在第一个 await 前复制字节及 receipt。上层已存在校验；本次未发现直接从公开API绕过上层的路径，不将底层缺口描述为已确认的外部远程利用。写入者仍是私有可信接口，上层仍负责鉴权、已验证版本与manifest绑定。
2. `screenshot/worker.mjs` 首轮恶意截图组超出30秒测试上限。页面脚本可使优雅关闭在页面超时后继续等待；现在原有 job deadline 一直覆盖 browser cleanup，截止时调用锁定 Playwright 的强制 kill。未知清理仍失败；超时不返回PNG/成功，外层 stdio 进程树截止不变。正常截图、原有配额和最多两次队列尝试不变。

## 证据的适用范围

构建、Docker回收、浏览器、预览gateway、生产nginx配置与TLS HTTP均真实执行。网络响应状态/内容故障由明确的 HTTPS transport double 注入；站点域名固定解析至本机，自签TLS仅在测试浏览器忽略证书错误。它们不证明真实公网 DNS/TLS、线上配置或平台登录API端到端已验收。站点签发/平台标记是明确的可信测试 fixture，不代表绕过生产签发。

本专项不向网络发起真实凭据请求；未调用付费模型。截图/浏览器是受监督的独立进程与网络策略，不替代操作系统隔离，也不证明浏览器零日漏洞或任意宿主OOM安全。构建的真实cgroup OOM、PID/CPU/内存限制继续由既有 runner 门禁覆盖。部署必须继续使用受控、容量有限的 worker 主机及既有宿主权限/资源策略。

安全失败阻止当前候选晋级。不得把未知退出码、清理未知、取消、未执行测试或历史main的绿色结果改写成当前候选成功。完整阶段结果、失败历史、PR/同伴状态与剩余限制见 `docs/handoffs/D19-B.md`。
