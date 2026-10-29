任务ID：D24-A；成员A；基线 main `5a0f14d`；分支 `codex/d24-a-api-body-boundary`。

API 请求体此前在完整解析后才做字段长度校验，无法保护直连 API 的解析内存；正常创建应用 JSON 加超大空白还会返回201并写入数据库。本改动在身份/CSRF/角色/路径检查后、MVC 前限制完整请求体为128 KiB，包含chunked请求，超限以既有400 INVALID_REQUEST拒绝。

- 范围：只改 services/api、tests/regression/api、docs/defects.md 与 D24-A 交接；无依赖、迁移、配置或公共契约修改。
- 先红后绿：原过滤器4项中2失败；相同真实HTTP/PostgreSQL测试配合旧过滤器返回201（期望400），native1；修复后首轮9/9、native0。原始失败、摘要及源码指纹都保留。
- 兼容/失败：恰好128 KiB及最坏JSON转义的8000码点输入可提交；超限不创建应用，401/403优先级与取消终态保持；断流不进入控制器。
- 模型来源：专项无模型调用；完整阶段门禁为deterministic-mock。真实模型效果不由本PR证明。
- 最新完整本地门禁：回应B审查后仅执行一轮原始ci:gate，冻结HEAD9cf78ef，**static/api/runner/e2e/ci-gate均native0**。API385/385、runner268/268、e2e75/75及全产品PASSED，原失败的PreviewPlatformIntegrationTest 1/1。80份JUnit共385项、全部233份API源码字节及日志SHA256复算一致。规范新报告：tests/regression/api/evidence/review-round2-candidate.json。
- B建议已处理：新增services/api/README.md公开128 KiB字节上限、chunked、权限检查优先级、400 INVALID_REQUEST/no-store及错误示例；示例通过现有error.schema的AJV校验，未改共享OpenAPI/schema。回应与证据见tests/regression/api/review-response.md。
- 历史失败保留：首轮API385项中1失败、ci-gate=1仍在原candidate.json，原csrf 502/HTML及CONNECT TIMEOUT/UNKNOWN不改写。一次定向诊断及本轮完整验收未复现，生产源码/入口/超时/重试/断言均未改；历史连接故障具体根因仍UNKNOWN，D24-A-ENV-02待B/环境维护者复核，不宣称根因修复或自动解除发布冻结。原始和新报告分目录，未重跑追绿。
- 受影响回归：边界9/9、权限矩阵7/7、旧版本HTTP5/5（与B核验的21项一致）、发布8/8、队列7/7、SSE10/10。最终文档/证据HEAD的远端检查另查，不继承旧提交success。B #78独立互审与批准记录保留在review-D24-B.md，不等于A获批准或A+B组合验收。
- 回退：回退本PR生产代码即可，无数据/配置迁移。无线上操作。
- 审查者：另一名成员；本人不自批、不合并。所有必需检查真实success、同步最新main、无阻塞讨论且独立批准后才具备合并条件。D21真实效果及D23运营启用保留其既有阻塞。
