# D12-B：组件标识与版本化源码映射

目标分支：main；候选分支：codex/d12-b-component-mapping；状态：已推送，远端[草稿 PR #36](https://github.com/Echo-love928/CodeLess/pull/36)，未合并。

受控 Vue 页面原先缺少可验证的组件到源码映射。本变更给组件根加入稳定标识，在实际 Vite
构建时生成组件清单，再由可信 runner 校验产物/源码摘要并绑定不可变版本。选择请求仅含
componentId/versionId/sourceDigest，整份组件源码作为共享修改范围；版本错配、非法路径、
伪造映射及缺失/动态/重复标识均拒绝，禁用原因可显示给用户。

验证：实际 Docker/Vue/Chromium 验收6/6、严格契约正反例2/2，exit0；包含嵌套和重复实例、
旧版本拒绝、已有文件错误重映射、路径/ID/digest行尾换行、无效标识等边界。
首轮类型缺失和第二轮测试fixture语法失败均保留记录。四阶段最终状态见
`docs/handoffs/D12-B.md` 收尾节，证据见 `tests/runner/mapping/evidence/2026-10-12/`。

完整门禁：static65/65、runner56/56、E2E42/42通过；API176项有1项真实平台iframe预览失败，
ci:gate原生exit1。失败后原预览IT串行复核1/1、exit0，原产物digest相同且实际源码/iframe一致；
根因UNKNOWN，首轮失败保留，整体门禁仍FAILED，不满足合并条件。

映射作为版本sidecar返回，API不可变持久化、D12-A并发修改任务及UI预览选择桥待最终启用PR
接入；未有A候选可互审，不宣称平台可视化编辑联调完成。没有修改公共OpenAPI、锁、CI、
API/UI或main，没有AST精确编辑、实例级修改、自动发布或任意命令权限。

首次推送被自动审批拒绝，随后用户明确回复“允许”，授权推送独立分支并创建草稿PR。
2026-10-12已按该授权完成推送/创建并附加到当前聊天；main仍为原基线，未自批或合并。
首次门禁失败与剩余联调限制保持，当前候选远端检查以PR Checks为准。
