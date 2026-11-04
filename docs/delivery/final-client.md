# D30-B 最终用户流程交接

日期：2026-11-04，Asia/Tokyo；分支 `codex/D30-B`，main基线 `6998a42395004d3e358d1cb127261e815456b05e`。所有入口、身份、材料和账本见[交付索引](index.md)。取消真人彩排和完整录像，不将取消项列入阻塞。

## 接手用户流程

1. 在平台登录，用自己的账号新建Vue应用并选择静态/Mock/LocalStorage数据模式；账号通过既有私下方式提供。
2. 输入需求，查看PLAN→GENERATE→VERIFY→REPAIR/READY进度。READY依赖真实构建/浏览器结果；失败时保留最近可用版本，可刷新任务或使用恢复链接，不能把未知终态当成功。
3. 选择已验证版本查看源码和预览；进入“选择组件进行修改”，确认共享实例影响后创建组件修改。编辑重新验证、生成新不可变版本。
4. 选择目标版本，勾选“我确认公开发布上方版本”，点击“确认发布”。不自动发布、不发布失败或其他用户版本。
5. 发布成功后查看公开地址与封面绑定；“刷新封面”读取状态，不保证立即成功、不改变发布版本。封面失败不抹掉最近可用发布。
6. 选择“下载版本”，核对版本ID与“源码摘要”，点击“下载源码”。下载为所有者鉴权GET；匿名401、其他用户404、失败版本409均不能写成下载成功。

逐控件与恢复步骤见[用户手册](../user-guide.md)，七镜头操作/观察/失败分支见[演示脚本](../demo/full-script.md)。上述为接手说明，实际验收范围以D28最终复审及本卡新回执为准；没有声称本轮进行真人全流程。

## 源码包独立运行

目标样例：version `bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe`，ZIP SHA256 `c4d094306dad2914acd577750df68e2b2050d692fc72335addf7583f077775c9`。不要从受保护历史trace中提取会话。所有者可正常在平台下载；本轮使用既有本地安全交付的同摘要原包验证，不新建版本/发布。

解压到独立目录，进入 `codeless-bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe`。按包内README使用Node 24.22.1与pnpm12.6.0：

```sh
corepack pnpm@12.6.0 install --frozen-lockfile
corepack pnpm@12.6.0 run build
corepack pnpm@12.6.0 exec vite preview
```

打开默认本机4173端口的 `/`、`/tasks`、`/catalog`；无需平台API、数据库、.env或模型密钥。此样例只证明对应静态示例，默认路由占位页不当作CRUD/搜索完成。摘要算法及边界见[包说明模板](../generated-project-readme.md)和[导出契约](../../contracts/export/README.md)。

在本仓库根可复现：

```sh
node tests/export/verify-export.mjs <download.zip> --version bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe --source-digest sha256:2239f682cdf36d1fccd9adb61fe0c64736730a0d33191ec3364b09316179b9e9 --artifact-digest sha256:05dc193860ef0024013f76933f991b4603faa12d981d0b935877a9339d004393 --out <new-verification.json>
node tests/export/clean-build.mjs <download.zip> .local-data/d30-b/export-clean-unique
```

clean-build使用摘要锁定Node镜像、空容器目录与独立pnpm store，仅只读挂载解压项目，不挂仓库依赖或秘密。构建可运行与原产物逐字节复现是两个结论，未指定expect-artifact-digest时不声称后者。网络、Docker不可用或退出非零都保留失败。

本轮同摘要原包独立核验、空容器安装/构建均原生0：[回执](../../tests/delivery/client/evidence/export-20261104/receipt.json)、[构建报告](../../tests/delivery/client/evidence/export-20261104/clean-build.json)。随后真实Chromium在只允许loopback的静态服务器打开并刷新三个路由，[浏览器回执](../../tests/delivery/client/evidence/export-20261104/browser.json)原生0；两个默认页只是占位内容，未作完整CRUD宣称。本轮没有重新认证下载，复用既有本地安全交付原包。

## 接纳边界

只有D28最终复审已验收功能和本轮实际核验结果列为通过。历史增量组合8/9、TASK-03失败、代码故障3/3、环境2/2复用继续保留；生产mock不能证明真实模型效果。D29材料与本轮文档校验不替代平台浏览器或API门禁。

本轮原始命令、退出码、证据、五项符合性及M6未满足项见[本卡交接](../handoffs/D30-B.md)。D30-A已在PR100交付并完成[B只读互审](../../tests/delivery/client/review-D30-A.md)，正式标签、生产异机恢复与最终同候选批准仍HOLD；不自批、不合并、不修改main。
