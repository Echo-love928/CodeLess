# 项目删除与默认封面

2026-11-04。新增接口沿用平台 session、owner 权限及写请求 CSRF 校验，不修改共享迁移。

## 删除项目

`DELETE /api/v0/applications/{applicationId}`，仅 owner，成功 `204`、`Cache-Control: no-store`。同一 owner 重复删除返回 `204`；不存在或他人项目返回 `404`。应用行加锁，与创建生成任务、组件修改及发布的应用锁串行化；存在非终态生成/修改任务或 REQUESTED 发布时返回 `409 APPLICATION_BUSY`。

删除采用已有 `ARCHIVED` 状态：项目不再出现在用户列表及其 total 中，项目详情不可打开，不能新建生成、修改或发布。原已发布网站、版本、模型用量、金融预留与审计记录保留，不级联删库或物理清理目录，不因删除退还模型预算。已有所有者版本/源码只读契约保持。

## 项目卡片封面

`GET /api/v0/applications/{applicationId}/versions/{versionId}/cover`，仅活动项目 owner 可读取属于该项目的 VERIFIED 版本。返回 `image/png`，`Cache-Control: private, no-store`、`Vary: Cookie` 和 `X-Content-Type-Options: nosniff`。未登录、他人项目、错误项目/版本绑定、失败或草稿版本不能读取。

复用真实浏览器验证保存的 `page.png`，无需先发布、创建截图任务或额外模型调用。数据库核对 owner/项目/版本/build；冻结 outcome 的 source/artifact/build/verification 与固定 evidence 根的 result.json、PNG 路径、大小、SHA256及1280×720尺寸交叉绑定。不接收文件路径、任意URL或截图目标。缺失/不可信截图返回不可用，卡片显示回退占位和手动重新加载入口；无已验证版本的项目提示生成后显示封面。

## 界面

工作台预览工具栏和 iframe 上方不展示版本 UUID。版本记录、不可变绑定及诊断仍使用原内部标识。

按用户明确要求，本次不运行自动测试；人工验收由用户执行。
