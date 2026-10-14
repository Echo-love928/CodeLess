# D14-B：组件选择、共享确认、修改状态与确切版本预览

Base：main / 418290e；分支：codex/d14-b-visual-edit-flow。仅本地草稿，未创建远端B PR。

原选择器创建任务后重载工作台，缺少共享影响确认和任务产物身份核对。本改动要求显式确认整份源码组件及所有实例的影响，在当前版本工作台观察修改任务、取消及可读日志。只有READY任务、SUCCEEDED/exit0构建与同来源VERIFIED版本一致时才切换预览/源码并重建映射会话；失败、取消、未知及错配均保留旧预览。应用摘要刷新不会将别的latest指针冒充本任务产物。

验证：首轮完整ci:gate exit0（static82/API203/runner69/E2E48）；最终状态修正static89、E2E48、专项浏览器6均exit0。独立组合A56cb4e9+B a40af3f的真实Postgres/Docker/Vue/Chromium验收8/8、exit0，包含当前UI选中→确认→修改→真实验证→确切新预览及旧源码保留。四类UI请求/版本摘要是明确fixture，见four-scopes.json；真实模型效果未评测。

范围：visual-edit、versions、对应测试/交接。原真实平台测试仅加一次共享确认勾选，其全部断言保留；不改公共契约、依赖/锁、CI、迁移、后端或runner。A新增恢复路由的公共登记属于其维护者，本UI不调用恢复写接口。

剩余：另一人对B最终候选独立批准、远端精确HEAD必需checks与讨论核验。首轮gate不是后续HEAD重跑记录，最后修正已按影响范围重跑；没有自批、推main、合并或发布。交接：[D14-B](../../../docs/handoffs/D14-B.md)。
