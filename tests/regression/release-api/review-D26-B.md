# D26-A 对 D26-B 的只读互审

2026-10-31（Asia/Tokyo）。PR [#87](https://github.com/Echo-love928/CodeLess/pull/87)，精确 HEAD `b0fc7731350180bed70a1116c44d14e3be09be35`，基线 `df6822e2330d82f0ed5cffaf033e4b54368e6e31`。没有修改 B 文件、提交 review、批准或合并。

## 阻塞问题

本次 diff 未发现新增代码级阻塞。**总体发布继续 HOLD**：原需求 6/9、原批次 13/14、故障门槛未达标、自然 REAL FAILED 编辑未观测、生产自动 capture 仍未启用。这些既有阻塞不能用键盘 fixture 或 CI 成功关闭；B 的交接已如实标注。A 最终候选与 B 的组合联调尚未执行，不能以双方各自 CI 替代。

## 建议

- `apps/web/src/features/visual-edit/VisualComponentEditor.vue:47`：后续可补键盘选择请求尚未返回时切换版本的专项浏览器用例。目前仍复用 `selectionGeneration`、abort、服务端选择校验及 `generation`，未发现当前 diff 破坏迟到响应隔离的证据；这是非阻塞覆盖建议。
- 自然模型失败与受控坏 Vue 回归分账。`tests/regression/release-ui/flow.spec.ts:125` 的 PK 字节是明确命名的 HTTP transport fixture，不能用作真实 ZIP 完整性证明；B 已在测试和交接声明这一限制。

## 已核验内容

1. `git diff origin/main...origin/codex/D26-B -- apps/web/src/features`：三项变更分别复用现有服务端选择、已验证版本发布和源码导出实现；新增焦点管理没有添加权限或替换失败状态。键盘取消重新清空确认；提交仍要求当前服务端 selection、描述、共享范围确认以及 flow 锁。
2. `apps/web/src/features/deploy/DeployPanel.vue:144`：打开后将焦点放到关闭按钮；Esc 调用原 close；版本切换仍清空 artifact/confirmation 并重新读取版本。发布不由面板打开或键盘选择自动触发。
3. `apps/web/src/features/source/SourceDownload.vue:32`：恢复焦点受 current generation、原触发焦点和当前 body 焦点约束；用户已移动到其他控件时不抢焦点。导出版本/hash 校验、401/error 路径和 abort 保留。
4. `tests/regression/release-ui/flow.spec.ts`：5 项真实 Chromium fixture 测试覆盖键盘选择/取消/提交、Esc、409、FUTURE 保留旧预览、发布显式 version/hash、错误版本响应零下载、移动焦点不被抢回；未删除原失败断言、增加重试或放宽期限。复现命令：`node apps/web/node_modules/@playwright/test/cli.js test --config apps/web/playwright.release.config.ts`（本次只读审查，未在 A 工作区执行 B 浏览器测试）。
5. 原完整 smoke 入口增加 release-ui testMatch，旧 `**/e2e/**/*.spec.ts` 保留；限定入口 workers=1、retries=0。两个原 native1 和最终 5/5 native0 均存在。B 本地 gate 被停止后保持 FAILED/CANCELLED_DUPLICATE，未冒称本地全门禁通过。
6. runner/infra/contracts 的 Git tree 身份分别为 `04bee318d3b23d80bae7010f518d5b579b76661b` / `8fdaaebc236da063d8c2bdd20dd0834916b475ef` / `f4d7b91d2b7f5d6ed50078b4a0a4b683594e4e38`，与 main 完全一致。未修改网络/容器隔离、锁文件、依赖版本或公共契约。B 的 isolation-run 21/21 是其已有执行证据，本次未冒称 A 独立重跑。
7. 公开 GitHub API 于 `2026-10-31T10:17:11Z` 查询 PR 精确 `b0fc773`：draft/open，static/API/runner/E2E/infra-preflight/ci-gate 六项 completed/success，均绑定该 HEAD。原始精简回执 `peer-pr87.json`；没有继承旧 `85155fd` 候选状态。复现：只读 `GET /repos/Echo-love928/CodeLess/pulls/87` 及 `GET /repos/Echo-love928/CodeLess/commits/<HEAD>/check-runs`。

结论：此审查未发现 B 新增代码阻塞；不代表质量门槛、独立真实模型复评或双方组合联调完成。保持草稿，未批准。

后续A本机完整门禁暴露共享runner镜像可用性阻塞：固定3286dd3上runner276/285，9项映射before hook收到固定imageId不存在；B此前精确HEAD的Linux CI success不否定这个Windows实测。独立映射15/15不关闭整套失败。请runner/公共门禁维护者与B协调；细节见D26-A的gate/runner-failure.json，A未修改B文件或runner代码。
