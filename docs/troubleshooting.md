# 安装与交付排障

记录失败命令、原生退出码、工具版本、Git HEAD 与同轮报告。不输出 .env、Authorization、会话、私有主机信息，不以旧证据覆盖本轮失败。

| 现象 | 检查与处理 |
| --- | --- |
| pnpm 为 11.x / engine 不匹配 | 应为 12.6.0。按 install.md 创建 Corepack shim 并置于 PATH 首部，嵌套脚本也要使用锁定版本。 |
| Corepack ENOTFOUND / Maven、镜像拉取失败 | 检查网络、DNS、代理和仓库权限。保留非零退出码；恢复网络后运行，不改版本或删除 frozen-lockfile。 |
| Java 卡住/版本错误 | JAVA_HOME 指向 JDK 21，bin 在 PATH 首部，检查 java/javac。Windows Oracle javapath 可能遮蔽正确 JDK。 |
| Docker 不可用/被拒 | 检查引擎、Linux 容器及账号权限。静态通过不能替代 DB/构建/浏览器验收。 |
| Windows TLS fixture 无 OpenSSL | 安装 Git for Windows，让 C:/Program Files/Git/cmd 先于 mingw64/bin；fixture 据 Git 位置查 usr/bin/openssl.exe。 |
| Chromium 或系统库缺失 | 用锁定 pnpm exec playwright install chromium；Linux 用 --with-deps。外部 Chrome 不替代受控 runner 配套浏览器。 |
| 数据库拒绝连接/缺变量 | pg_isready 检查；Compose --env-file 不给宿主 Java 注入变量，按 install.md 导入同一私有配置。 |
| 端口占用 | 修改私有配置并同步 JDBC URL，运行 infra/check-config.mjs。自动演示使用动态端口。 |
| 无账号/登录后退出 | 两密码均空不创建；非空须不同且至少 12 字符。既有账号不自动重置。回环 HTTP 使用 COOKIE_SECURE=false，生产 HTTPS true。 |
| 登录可用但生成/发布不可用 | 基础启动未配置完整 Agent/预览/托管。先运行自包含 Mock 演示，再按各模块指南部署；不挂 socket、不关闭隔离。 |
| MODEL_CONFIGURATION / MODEL_AUTHENTICATION | 真实 provider 为 deepseek，需进程内有效 key 和模型名，改配置后重启。不打印变量值，缺配置 CLI 应 BLOCKED/exit 2。 |
| 模型限流/网络/格式错误 | 查同轮审计错误码、请求标识和 usage，未知保持 null，不用 Mock 代替真实验收或无限重试。 |
| 导出得到 JSON/失败 | 只下载拥有且 VERIFIED 的版本；401 查登录、404 查归属/ID、409 查版本状态、503 查快照完整性，不把 JSON 保存成 ZIP。 |
| 导出不能构建 | 使用包内工具链和锁，执行 verify-export/全新 clean-build。旧工具链包应重新导出，不改 manifest；exit 3 是指定产物未复现。 |
| /health 成功但网关 502/404 | 健康只证明服务存在；查宿主 API/Vite、真实预览/托管和独立站点配置，不能当成发布验收。 |
| Windows 进程清理断言失败 | 保留 JUnit、退出码与 cleanupErrors；不关闭断言或反复重跑掩盖失败，Linux CI 结果另记。 |
| Mock 全产品触达 180s 总截止 | 核对同轮 browser.log 的失败位置、任务 ID、API timing、SQL 终态及 cleanupErrors，确认本机 Docker/CPU/内存负载。SQL 稍后终态不能替代截止时的浏览器断言；保留失败，不延长超时或用反复重跑覆盖，资源不足则记录受阻。D23-B 首轮记录见交接。 |

自动演示证据在 .local-data/d20-b/commands 与 runs 同轮目录，trace 可能含会话，保持私有。停止仅处理自有 PID、命名容器或 Compose 项目，不执行全局 Docker prune。共享环境备份/恢复由 D23-A 运维交付单独验收。
