# feat(selector): 预览组件选择与受控跨窗口通信

原预览点击桥只能切换选择模式，缺少悬停、取消、Esc 与会话绑定。此变更加入组件选择器，
通过闭合消息、确切 origin/window source、版本/摘要及随机会话 nonce 校验双方通信。
嵌套点击定位最近组件根；侧栏明确修改整份源码组件及所有共享实例，实例编号仅用于显示。
退出编辑后恢复生成页面的点击和导航行为。

保留 D12 的可信源码解析与修改 API：浏览器只发送 componentId/versionId/sourceDigest，
不提交 sourceFile/DOM selector/实例授权。新增桥由原可信网关注入，不改冻结产物、依赖、
公共契约、CI 或 API。跨卡入口只修改 PreviewPanel 挂载和 gateway renderer 调用。

验证：静态门禁72个UI单测、类型/lint/生产build通过；选择会话及原预览专项9/9通过；
真实Chromium专项3/3覆盖T1–T4、桌面/手机侧栏及双方伪造消息/重放反例。
8cf完整ci:gate通过：API192/192、runner69/69、E2E45/45；侧栏变更后static与真实预览单测
再次通过，但最新完整E2E44/45失败于既有登录等待用例。trace出现pageClosed，确切根因UNKNOWN；
串行定向1/1成功不代替整体失败。证据及精确状态见`docs/handoffs/D13-B.md`，当前禁止合并。

限制：D13-A尚无可审查候选，当天互审与最终联调待其提交；作者未自批、未合并。
用户已授权推送，远端[草稿PR #39](https://github.com/Echo-love928/CodeLess/pull/39)已创建。
精确候选Checks以PR最新HEAD为准，创建成功不等于门禁通过。未自批、未合并、未推main。
