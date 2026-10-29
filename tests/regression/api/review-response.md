# D24-A 回应 B 对 7a17a6b 的审查

审查输入来自用户转交的 B 结论：未发现新增生产代码阻塞；B 独立先红后绿及重新编译后的边界、权限、旧版本21/21通过；7a17a6b远端六项通过。该21项是B的独立结果，不记作A本轮新执行。

| B 的意见 | 本轮处理 / 状态 |
| --- | --- |
| 本地完整门禁预览502尚未关闭，暂不批准 | 保留原385项中1失败、ci-gate=1及入口诊断。一次定向原入口诊断native0、1/1，随后仅执行一轮完整原始gate，**四阶段与ci-gate全部native0**：API385/385、runner268/268、e2e75/75及全产品通过，原预览例1/1。当前完整本地成功验收证据已补齐；历史根因未知，由B/环境维护者复核是否解除阻塞，不自行关闭。没有修改生产源码、Nginx、网络设置、超时、重试、断言或隔离。 |
| 公共API文档补充128 KiB与超限行为 | 新增 `services/api/README.md`：131072字节包含语法/转义/空白；已知长度及chunked；401/403/路径检查优先；超限400 INVALID_REQUEST/no-store/固定消息；无副作用、8000码点最坏转义兼容及实现/测试入口。文件在本卡允许的API范围，未修改共享OpenAPI/schema/根文档或新增状态码。 |

定向命令：`node tests/regression/api/record-body-boundary.mjs preview`，2026-10-29 15:25（Asia/Tokyo），native0、1/1，证据 `evidence/2026-10-29T06-25-09.715Z-preview/`。真实PostgreSQL、Tomcat、Docker/nginx/TLS、构建、Chromium，明确deterministic-mock且modelQualityAccepted=false。原有重启、保留期撤销、凭据错误日志保护、组件选择及源码一致性断言全部保留；容器/网络remaining=0、cleanup.complete=true。

白名单复算 `evidence/review-preview-diagnostic.json`：184个HTTP200、1个401负向对照、5个CONNECT_UNKNOWN，未截断；该入口GET时序白名单中没有HTTP5xx。原脚本中撤销预览凭据返回503的负向断言仍执行并通过，不把它改为成功。UNKNOWN仍保持UNKNOWN。历史原记录中IPv4大部分成功、一次CONNECT TIMEOUT、IPv6连接失败；本次未复现原502。历史超时具体根因仍UNKNOWN，未凭一次成功改为已修复。

原始现场/摘要和旧门禁不覆盖。新门禁独立目录：`evidence/2026-10-29T06-29-39.894Z-gate/`，被测HEAD=9cf78ef，API生产/测试源码与B审查的7a17a6b相同。完整门禁仅运行一次，不自动重试失败阶段。规范新报告 `evidence/review-round2-candidate.json` 为PASSED，旧candidate.json仍FAILED；日志SHA256和全部233份API字节复算匹配。新完整预览白名单见 `review-full-preview-diagnostic.json`。本地全绿不等于历史根因已修复、B批准或放行发布；最终HEAD远端检查另查。

开发input/output/total仍UNKNOWN；本轮付费模型请求0，完整Mock累计用量未汇总，不用0代替未知。A不自批、不合并；新候选由B增量复核。
