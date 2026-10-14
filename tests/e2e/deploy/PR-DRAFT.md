CodeLess 缺少对已验证 Vue 产物的独立静态托管和发布确认界面。本变更新增按 deploymentId 隔离的不可变产物发布、独立站点 Nginx HTTPS 配置和只接受固定公开目标的受限 Docker 访问探测；公开资源与验证字节逐一匹配，缺失资源不回退 HTML，源码、映射目录和部署元数据不提供访问。

工作台新增发布面板：展示确切版本与摘要，必须显式确认后才 POST 现有 publication 契约，失败保留上次经服务端核验的成功地址，支持状态刷新、会话恢复和地址复制；未知提交不自动重试。仅工作台挂载和 runner 测试发现入口需要跨本卡默认目录，公共 API/契约、根锁、CI、迁移及 main 均不修改。

验证：静态exit0（前端97/97）、runner exit0（72/72）、`verify:e2e --workers=4` exit0（完整52/52）。默认10-worker e2e首轮49/52、exit1；全量API首轮210项中1项CSRF502失败，原失败类独立复验1/1、exit0，不能覆盖全量失败或宣称间歇问题已修复。原始退出码见 docs/handoffs/D15-B.md 和 tests/e2e/deploy/evidence/2026-10-14/commands.json。

包含真实 Docker/Vue/Chromium → 静态发布 → 实际 Nginx HTTPS → 隔离 Docker 探测、子路由刷新、资源/源码负向请求，以及真实发布面板 Chromium 确认/失败保留/手机/未知状态测试。测试站点与自签名 TLS 明确是本机 fixture，不能证明公网发布。API/预览网关及原登录/创建/浏览器测试未改；本地完整ci-gate条件仍未满足。

剩余前置：D15-A 发布 API/coordinator、数据库版本锁/幂等/最近成功记录、跨设备与丢失 POST ID 的恢复契约；公网 DNS、TLS 与已部署托管资源。基线和开放 PR 列表未发现可互审的 D15-A 候选。公网完整发布里程碑未达成，不能启用后宣称真实联调完成。保持草稿，待同伴审查、精确 HEAD 必需 CI 成功及讨论处理后再评估合并；不自批、不合并。
