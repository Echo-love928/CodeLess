# 前端 / runner 缺陷记录

## D24-B-01：刷新期间旧预览仍能改变状态

- 优先级：P2，已修复；不涉及服务端权限变更。
- 来源：D21-B 浏览器/编辑边界待办及本轮预览生命周期检查。原 D21 的真实模型失败仍按原记录保留，本项不是对其根因的重新归因。
- 影响：刷新工作台版本信息时，旧 iframe 的 `loaded` 消息可重新开启预览及编辑；旧凭据到期可将刷新中的状态覆盖为 expired，重新开放刷新按钮，使并行刷新成为可能。
- 根因：`PreviewPanel.refresh()` 在等待 `refreshVersion()` 前保留了旧凭据、iframe、消息所用身份和定时器。原 generation 保护只在 `load()` 时推进，不能隔离这个等待窗口。
- 最小修复：刷新入口先调用已有 `dispose()`，使旧 generation 失效、取消旧请求及定时器、移除旧凭据；随后显示 loading，再读取版本。新版本 watch、旧响应隔离、正常凭据重签继续使用现有流程。
- 修改：`apps/web/src/features/preview/PreviewPanel.vue`；测试在同目录 `PreviewPanel.test.ts`。

复现：

```sh
corepack pnpm --filter @codeless/web exec vitest run src/features/preview/PreviewPanel.test.ts
```

新增测试分别让版本读取 Promise 暂停，然后发送旧 frame 的合法来源 loaded 消息，或推进旧凭据的到期时间。修复前 8 项中 2 项失败、exit 1；修复后 8/8、exit 0。相同测试字节，只有被测组件变化；前后日志见 `tests/regression/experience/evidence/2026-10-29/`。这是 jsdom/Vue 组件回归，不能当作真实浏览器或模型效果验收。

保留的边界：严格 origin/source 校验、受限 iframe sandbox、过期移除 frame、15 秒页面加载失败、旧应用/版本请求隔离、错误文档不能算 loaded、旧刷新失败不能移除新版本。本轮没有升级依赖、放宽浏览器或 runner 隔离、修改契约/后台或增加体验功能。

阶段门禁与剩余联调限制见 `docs/handoffs/D24-B.md`。该缺陷关闭不代表 D21 真实模型验收或候选发布整体通过。
