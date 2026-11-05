# BUG-11 至 BUG-19 修复说明

| 编号 | 修复后的行为 |
|---|---|
| BUG-11 | 工作台及事件日志使用中文结果文案；任务、构建、文件和源码校验标识放入详情；发布时间和事件时间统一显示北京时间。空白初始版本显示“等待首次生成”，数据模式附带用途及保存范围说明。 |
| BUG-12 | 新建应用的名称及简介输入限制长度；删除按钮为应用名称加引号；API 保存简介前去除首尾空白。 |
| BUG-13 | 文件工具累计整个任务的文件变更，保留首次变更前及最新变更后的摘要；反复修改不会覆盖其他文件，撤销到原始内容后移除该项。 |
| BUG-14 | 预览确认加载完成后才发送组件选择探测，避免向初始空白 iframe 发送跨域消息。 |
| BUG-15 | 网关原子消费启动凭据 nonce，到期清理；同一凭据并发请求仅一条可兑换 cookie，已兑换 cookie 的资源请求不受影响。 |
| BUG-16 | 登录限流按真实客户端 IP 与账号计数，预先预留计数防并发绕过。某一来源失败不会锁住其他来源；未知邮箱的限流表不能影响真实账号。 |
| BUG-17 | 采用删除后统一不可访问的语义：归档应用的详情、版本列表、文件、快照、导出等返回 404；界面明确暂不支持恢复，历史数据仅在内部保留。 |
| BUG-18 | 模板识别实际生成的页面；有多个生成页面时显示可访问导航，排除模板占位页。 |
| BUG-19 | TLS 测试优先使用 PATH 中可运行的 OpenSSL，随后检查全部 Git 安装的 cmd、mingw64/bin 等候选位置。 |

## 部署

- 前端、API 和 runner 一起更新。
- BUG-16 的公网客户端 IP 需要完整透传：重新生成 `infra/public/render.mjs` 输出的 edge、platform、hosting 三份 nginx 配置，并一起重建入口容器。edge 使用 PROXY 协议传递源地址，TLS 入口仅信任私有 `172.28.0.0/24` 网段；platform 覆盖请求中的转发头，API 的原生 Tomcat remote-IP 处理只信任该私网。API 端口继续由现有防火墙限制访问。自定义反向代理部署应以 `CODELESS_AUTH_PROXY_PATTERN` 明确配置实际可信代理地址的正则表达式。
- 模板导航需要重建 `infra/build-image/Dockerfile` 对应镜像。既有构建产物、已发布网站和历史导出不会自动变化，需要生成新版本。
- 本 PR 不执行线上部署或修改线上数据。

## 验证入口

- `node scripts/run-static.mjs`：契约、前端 lint、单测、类型检查和生产构建。
- `node --test tests/infra/preview.test.mjs tests/infra/preview-csp.test.mjs tests/infra/config.test.mjs tests/infra/public-deployment.test.mjs`：预览凭据、TLS 解析、网关恢复和部署配置。
- `node --test tests/infra/template.test.mjs`：受控镜像构建、模板安全约束及真实 Chromium 多页导航。
- API 的 `ApplicationIntegrationTest`、`AuthIntegrationTest`、`AuthHttpTest`、`LoginProxyHttpTest`、`LoginAttemptsTest`、`TaskDiagnosticsTest`、`FileToolsIntegrationTest`、`TaskSseHttpTest` 和 `ExportTemplateTest` 覆盖本次后端修改。

2026-11-05 本地结果：静态检查通过（前端 221 项测试）；上述 API 定向回归 52 项通过；预览、配置及多页导航组合 24 项通过；模板构建和安全约束 6 项通过；edge、platform、hosting 三份配置均通过锁定 nginx 镜像的 `nginx -t`。

额外运行的 `SourceExportIntegrationTest` 中，源码权限、内容校验及发布追溯用例通过；干净容器安装用例停在外网下载 pnpm，手动停止该测试独占容器后记为未完成验证。未把这项结果计入通过数量。

## PR #104 的 CI 跟进

初次 CI 暴露了未同步迁移的浏览器断言：四组 e2e 用例仍查找旧文案、直接显示的任务编号或关闭详情中的内容。现已按真实用户操作展开详情、检查历史链接目标，保留原有功能断言；这四组共 30 项已通过本地 Chromium 回归。

新增的模板导航还使旧白屏探测将“只有导航、业务内容为空”误判为已渲染。探测现排除导航及不可见文本，继续将该场景识别为 `WHITE_SCREEN`；真实 Vue 构建中的原始负例已复核，另补了原生导航、ARIA 导航及隐藏内容的回归。
