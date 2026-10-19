部署成功后的截图应独立处理，截图超时仍保留网站与分享地址。本 PR 添加有界封面队列、状态占位和指定版本源码下载；根据成员 A 的互审，下载已对齐 D16-A 的真实流式接口。

## 互审整改

- 下载改为 GET `/api/v0/versions/{id}/export`，校验 `application/zip`、`X-CodeLess-Version-Id`、`X-CodeLess-Source-Digest`。不再要求长度、应用 ID 或 ZIP 字节摘要头；保留 16 MiB 流上限、30 秒、无重定向、同源 session、PK 签名和切换版本/账号时丢弃迟到结果。
- DRAFT/FAILED 在界面和适配器均拒绝下载，状态变更会中止旧请求；JSON code 对应固定错误提示，不鼓励重试不可下载状态。
- 第 101 次及后续发布可清理最旧终态封面并继续捕获；待处理/运行任务不清理，图片读取与清理串行。只影响封面保留，不改 PUBLISHED、SQL 历史或已发布网站。
- 增加离线 `recover-lock.mjs <root> --workers-stopped`，检查旧 PID、host、锁类型/大小/身份，拒绝活进程及无法确认的锁。操作前须停全部 coordinator/browser，不做启动时自动删锁。
- 原本机 RepairLoop 失败记录保持原样。其根因仍未知，A 和旧 B 精确 HEAD 的远端未复现，不将原失败改写为通过。

## 验证

最终本地：source/deploy 76/76；完整 static（前端 147/147、lint/typecheck/build/契约）、截图维护 11/11、完整默认并发 E2E 59/59、完整 runner 90/90，native exit 均为 0。

另外使用 A 的隔离真实 PostgreSQL、Docker、Chromium 和 session HTTP 服务，调用 **B 未 mock 的生产适配器**：A 无 Content-Length 的 ZIP 下载字节与直接 owner 下载及 A 干净安装构建输入相同；他人 404、匿名 401，DRAFT/FAILED/非法 ID 无请求。继承 A 原有导出验收共 6/6、exit0；交付的环境配置式复现 harness 再定向通过 1/1、exit0。A API 在候选 `684ef36` 与用于该测试的 `feb820c` 相同，Controller blob 为 `fdd82a37e725936596a4bf8041070e2dd1c5fe96`。

早期失败全部保留：工具 DNS 导致未启动、jsdom 文件路径加载错误、维护测试把 stderr 颜色警告混入 JSON，以及并行镜像准备期间 runner 的 4 项 `No such image`。分别修正测试路径、分离 stdout/stderr，并停止并行准备后独立复核；没有改旧断言、默认并发、截止时间或 Docker 隔离来获得通过。

本轮没有重跑完整本地 API/ci:gate，不把专项或历史绿色状态冒充最终提交的全部门禁通过。远端 CI 以 PR 当前 HEAD 实际结果为准。

证据：`tests/e2e/share/evidence/2026-10-19/review-fix/`；原始失败证据仍在父目录。交接：`docs/handoffs/D16-B.md`。真实联调复现：`tests/e2e/share/fixtures/README.md`。

## 剩余集成

封面 HTTP 入口、PUBLISHED 后协调器调度、共享 OpenAPI/专项门禁登记及公网地址→封面→源码→版本全链路仍由最后启用 PR 完成。当前提供独立封面模块与已通过真实 A API 的下载适配器，不宣称公网封面服务已安装。

保持草稿，等待成员 A 复审与精确 HEAD 的必需检查；不自批、不合并。main 不变，无 Java 生产代码、迁移、根锁、CI 或依赖版本修改。模型提案明确使用 deterministic-mock，构建/PG/浏览器/HTTP 真实执行，不代表付费模型效果。
