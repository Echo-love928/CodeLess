任务ID：D24-A；成员A；基线 main `5a0f14d`；分支 `codex/d24-a-api-body-boundary`。

API 请求体此前在完整解析后才做字段长度校验，无法保护直连 API 的解析内存；正常创建应用 JSON 加超大空白还会返回201并写入数据库。本改动在身份/CSRF/角色/路径检查后、MVC 前限制完整请求体为128 KiB，包含chunked请求，超限以既有400 INVALID_REQUEST拒绝。

- 范围：只改 services/api、tests/regression/api、docs/defects.md 与 D24-A 交接；无依赖、迁移、配置或公共契约修改。
- 先红后绿：原过滤器4项中2失败；相同真实HTTP/PostgreSQL测试配合旧过滤器返回201（期望400），native1；修复后首轮9/9、native0。原始失败、摘要及源码指纹都保留。
- 兼容/失败：恰好128 KiB及最坏JSON转义的8000码点输入可提交；超限不创建应用，401/403优先级与取消终态保持；断流不进入控制器。
- 模型来源：专项无模型调用；完整阶段门禁为deterministic-mock。真实模型效果不由本PR证明。
- 完整门禁：在2dd95fb执行原始ci:gate，static原生0，API/runner/e2e进行中；完成后追加原生命令/报告，不预填成功。首次记录器启动失败的exitCode=null/ENOENT保留，修正仅涉及记录器Windows Path。
- B只读审查：PR #78固定b98c023，独立相同测试字节旧组件6/8→修复组件8/8；未发现生产修复阻塞，建议补本地门禁状态/失败时unmount清理。精确B六项远端success不替代A结果或A+B组合。结论和原始独立日志见tests/regression/api/review-D24-B.md。
- 回退：回退本PR生产代码即可，无数据/配置迁移。无线上操作。
- 审查者：另一名成员；本人不自批、不合并。所有必需检查真实success、同步最新main、无阻塞讨论且独立批准后才具备合并条件。D21真实效果及D23运营启用保留其既有阻塞。
