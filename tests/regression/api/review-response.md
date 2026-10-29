# D24-A 回应 B 对 7a17a6b 的审查

## 更正：B点名的三个API文件原始指纹与LF比对

上轮将比对对象误判为文档/汇总工具，未覆盖B要求，不能解除该阻塞。本轮明确核对：

- `services/api/src/main/java/dev/codeless/api/data/TaskProgressService.java`
- `services/api/src/main/java/dev/codeless/api/tasks/TaskEventReplay.java`
- `services/api/src/test/java/dev/codeless/api/auth/AuthIntegrationTest.java`

`node tests/regression/api/verify-api-site-fingerprints.mjs` exit0、3/3：原始字节副本逐字节匹配原被测门禁sourceDigests；仅CRLF→LF后逐字节匹配9cf78ef、0dbc999、b5f9ec8三个Git版本，CRLF对数分别45/91/169，无内容差异。原文件实为混合CRLF/LF，另有单LF计数，完整轮廓在comparison.json；不能把Git LF统一重构为CRLF来匹配原始哈希。当前工作区LF内容也匹配复核Git版本。原始副本是本次补存且由原记录SHA256绑定，不伪称运行时已有副本，不从Git LF重构。
完整SHA256、Git blob OID、字节数、原始副本和复算规则在 `evidence/api-fingerprint-review-b5f9ec8/README.md`、comparison.json、site/*.raw；`-text`保护原始CRLF。API源码、门禁入口、断言、原通过/失败记录及UNKNOWN均未改动，未重跑门禁。正式批准仍待B复审。

---

## 历史误判：B对0dbc999的三文件指纹复核（对象非B要求）

只补证据，未修改被比对的PR-DRAFT.md、README.md、summarize.mjs，也未修改API源码或重跑门禁。
`node tests/regression/api/verify-source-fingerprints.mjs` exit0：三项历史现场SHA256逐字节匹配门禁提交9cf78ef的Git blob；三项当前现场与审查提交0dbc999的Git内容在原始字节和仅CRLF→LF归一化后均匹配。两个提交版本间存在运行后文档/报告工具改动，不能称为仅换行变化。
完整哈希、Git对象ID、差异补丁和守卫结果见 `evidence/fingerprint-review-0dbc999/README.md` 及comparison.json。API源码、门禁入口及版本文件均无差异。已只读核验0dbc999六项远端success，快照独立保存；新证据HEAD另查，不继承旧success。是否解除最后阻塞由B复核。

---

审查输入来自用户转交的 B 结论：未发现新增生产代码阻塞；B 独立先红后绿及重新编译后的边界、权限、旧版本21/21通过；7a17a6b远端六项通过。该21项是B的独立结果，不记作A本轮新执行。

| B 的意见 | 本轮处理 / 状态 |
| --- | --- |
| 本地完整门禁预览502尚未关闭，暂不批准 | 保留原385项中1失败、ci-gate=1及入口诊断。一次定向原入口诊断native0、1/1，随后仅执行一轮完整原始gate，**四阶段与ci-gate全部native0**：API385/385、runner268/268、e2e75/75及全产品通过，原预览例1/1。当前完整本地成功验收证据已补齐；历史根因未知，由B/环境维护者复核是否解除阻塞，不自行关闭。没有修改生产源码、Nginx、网络设置、超时、重试、断言或隔离。 |
| 公共API文档补充128 KiB与超限行为 | 新增 `services/api/README.md`：131072字节包含语法/转义/空白；已知长度及chunked；401/403/路径检查优先；超限400 INVALID_REQUEST/no-store/固定消息；无副作用、8000码点最坏转义兼容及实现/测试入口。文件在本卡允许的API范围，未修改共享OpenAPI/schema/根文档或新增状态码。 |

定向命令：`node tests/regression/api/record-body-boundary.mjs preview`，2026-10-29 15:25（Asia/Tokyo），native0、1/1，证据 `evidence/2026-10-29T06-25-09.715Z-preview/`。真实PostgreSQL、Tomcat、Docker/nginx/TLS、构建、Chromium，明确deterministic-mock且modelQualityAccepted=false。原有重启、保留期撤销、凭据错误日志保护、组件选择及源码一致性断言全部保留；容器/网络remaining=0、cleanup.complete=true。

白名单复算 `evidence/review-preview-diagnostic.json`：184个HTTP200、1个401负向对照、5个CONNECT_UNKNOWN，未截断；该入口GET时序白名单中没有HTTP5xx。原脚本中撤销预览凭据返回503的负向断言仍执行并通过，不把它改为成功。UNKNOWN仍保持UNKNOWN。历史原记录中IPv4大部分成功、一次CONNECT TIMEOUT、IPv6连接失败；本次未复现原502。历史超时具体根因仍UNKNOWN，未凭一次成功改为已修复。

原始现场/摘要和旧门禁不覆盖。新门禁独立目录：`evidence/2026-10-29T06-29-39.894Z-gate/`，被测HEAD=9cf78ef，API生产/测试源码与B审查的7a17a6b相同。完整门禁仅运行一次，不自动重试失败阶段。规范新报告 `evidence/review-round2-candidate.json` 为PASSED，旧candidate.json仍FAILED；日志SHA256和全部233份API字节复算匹配。新完整预览白名单见 `review-full-preview-diagnostic.json`。本地全绿不等于历史根因已修复、B批准或放行发布；最终HEAD远端检查另查。

开发input/output/total仍UNKNOWN；本轮付费模型请求0，完整Mock累计用量未汇总，不用0代替未知。A不自批、不合并；新候选由B增量复核。
